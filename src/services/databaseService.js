const { Pool } = require('pg');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.batchSize = 1000;
  }

  async initializeDatabase() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'csv_converter',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    const client = await this.pool.connect();
    await this.createUsersTable(client);
    client.release();
    console.log('Database initialized');
  }

  async createUsersTable(client) {
    const query = `
      CREATE TABLE IF NOT EXISTS public.users (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        age INTEGER NOT NULL,
        address JSONB NULL,
        additional_info JSONB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(query);
  }

  async clearUsersTable() {
    if (!this.pool) throw new Error('Database not initialized');
    const client = await this.pool.connect();
    try {
      // TRUNCATE is faster than DELETE and RESTART IDENTITY resets the SERIAL counter
      await client.query('TRUNCATE TABLE public.users RESTART IDENTITY;');
      console.log('Users table cleared.');
    } catch (error) {
      console.error('Error clearing users table:', error);
      throw error;
    } finally {
      client.release();
    }
  }



  async uploadUsersBatch(usersData) {
    if (!this.pool) throw new Error('Database not initialized');
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const values = [];
      const placeholders = [];
      let paramCount = 1;

      for (const userData of usersData) {
        const { name, age, additional_info } = userData;
        
        let address = null;
        let additionalInfo = { ...additional_info };
        
        if (additional_info?.address) {
          address = additional_info.address;
          delete additionalInfo.address;
        }

        const fullName = `${name.firstName} ${name.lastName}`;
        
        values.push(fullName, age, address ? JSON.stringify(address) : null, 
                   Object.keys(additionalInfo).length > 0 ? JSON.stringify(additionalInfo) : null);
        
        placeholders.push(`($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, $${paramCount + 3})`);
        paramCount += 4;
      }

      const query = `
        INSERT INTO public.users (name, age, address, additional_info)
        VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      await client.query('COMMIT');
      
      return { success: true, count: usersData.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllUsers() {
    if (!this.pool) throw new Error('Database not initialized');
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM public.users ORDER BY created_at DESC');
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getAgeDistributionGrouped() {
    if (!this.pool) throw new Error('Database not initialized');
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          CASE 
            WHEN age < 20 THEN '< 20'
            WHEN age BETWEEN 20 AND 40 THEN '20 to 40'
            WHEN age BETWEEN 41 AND 60 THEN '40 to 60'
            WHEN age > 60 THEN '> 60'
          END as age_group,
          COUNT(*) as count,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
        FROM public.users
        GROUP BY 
          CASE 
            WHEN age < 20 THEN '< 20'
            WHEN age BETWEEN 20 AND 40 THEN '20 to 40'
            WHEN age BETWEEN 41 AND 60 THEN '40 to 60'
            WHEN age > 60 THEN '> 60'
          END
        ORDER BY MIN(age)
      `;
      const result = await client.query(query);
      return result.rows.map(row => ({
        ageGroup: row.age_group,
        count: parseInt(row.count),
        percentage: parseFloat(row.percentage)
      }));
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

module.exports = new DatabaseService();
