const databaseService = require('./databaseService');

class AgeDistributionService {
  async calculateAndDisplayAgeDistribution() {
    console.log('\n' + '='.repeat(50));
    console.log('AGE DISTRIBUTION REPORT');
    console.log('='.repeat(50));
    
    const distribution = await databaseService.getAgeDistributionGrouped();
    
    if (distribution.length === 0) {
      console.log('No users found in the database.');
      return;
    }

    console.log('Age-Group\t\t% Distribution');
    console.log('-'.repeat(40));
    
    distribution.forEach(item => {
      console.log(`${item.ageGroup}\t\t${item.percentage}%`);
    });
    
    console.log('-'.repeat(40));
    const totalUsers = distribution.reduce((sum, item) => sum + item.count, 0);
    console.log(`Total Users: ${totalUsers}`);
    console.log('='.repeat(50) + '\n');
  }

}

module.exports = new AgeDistributionService();
