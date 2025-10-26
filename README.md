# CSV to JSON Converter API

A high-performance Node.js pipeline that streams large CSV files, parses complex nested data, and ingests it into a PostgreSQL database with high throughput.

This project is built to be **scalable and resilient**, capable of processing files with 50,000+ records in seconds while maintaining a constant low memory footprint.

## Core Features

  * ⚡ **High-Performance Streaming:** Processes multi-GB files with constant low memory usage using Node.js streams (`readline`).
  * 🚀 **High-Throughput Ingestion:** Ingests 50,000+ records in seconds using database connection pooling, batch `INSERT` operations, and `async/await`.
  * 🛡️ **Data Integrity & Resilience:**
      * Uses **PostgreSQL Transactions** (`BEGIN/COMMIT/ROLLBACK`) to ensure that batches either fully succeed or fail, preventing partial data.
      * Features a **"Skip-and-Log"** strategy: Invalid rows (e.g., bad 'age') are skipped and logged to `error_log.txt` without stopping the entire import.
  * 🔁 **Idempotent Data Load:** The API follows a "full-refresh" pattern. It truncates the table (`TRUNCATE ... RESTART IDENTITY`) before each run, ensuring a clean, idempotent state.
  * 🧠 **Efficient In-Database Aggregation:** Age distribution is calculated efficiently inside PostgreSQL using SQL `CASE` statements, not wastefully in the Node.js application.
  * 🧹 **Automatic Resource Management:** A custom middleware (`cleanupTempFolder`) empties the temporary file directory *before* each new upload, ensuring the server's disk space is protected.
  *  **File Type Validation:** A custom validator to check if only the CSV files are being sent in the request.

## Core Architectural Decisions

This section explains the *why* behind the project's design.

  * **Streaming (Memory) vs. Reading (RAM):**
      * **Problem:** Reading a 1GB CSV file with `fs.readFileSync` would load the entire file into memory, crashing the server.
      * **Solution:** This app uses the `readline` module to stream the file line-by-line. This keeps memory usage constant and low, whether the file has 100 rows or 10 million.
  * **Batching (Performance) vs. Row-by-Row (Slow):**
      * **Problem:** Inserting 50,000 rows one by one would require 50,000 separate database round-trips, which is extremely slow.
      * **Solution:** Data is processed in batches of 1,000. `databaseService.js` builds a *single* `INSERT` query with thousands of values. This, combined with a transaction, is exponentially faster and safer.
  * **In-Database (SQL) vs. In-App (JS) Aggregation:**
      * **Problem:** Pulling all 50,000 user rows from the DB just to calculate age groups in JavaScript is a massive, unnecessary data transfer.
      * **Solution:** The `getAgeDistributionGrouped` function runs a single SQL query with a `CASE` statement. The database (which is optimized for this) does all the work and returns a tiny final report for the console.
  * **Custom Parser (Dot Notation):**
      * **Problem:** Standard CSV parsers don't support the required nested dot notation (e.g., `name.firstName`).
      * **Solution:** A lightweight, zero-dependency custom parser (`parser.js`) was built to handle this specific business logic, including complex cases like quoted commas and escaped quotes (`""`).

## MINOR CHANGE
While in the assignment, it was mentioned that "You need to take a csv file from a configurable location(define an env config) in a node
application (ExpressJs or NestJs)", I took the file from the request from the user (it would be easier to integrate frontend, as the user would upload the file from the frontend).


## API Endpoints

### 1\. Process CSV File (Full Refresh)

Uploads, parses, and ingests a CSV file. This is a **full-refresh** operation: it will delete all existing data before inserting the new data.

  * **Endpoint:** `POST /api/process-csv`
  * **Content-Type:** `multipart/form-data`
  * **Form Field:** `csvFile` (Type: `File`)

**Example `curl`:**

```bash
curl -X POST -F "csvFile=@./sample_data.csv" http://localhost:3000/api/process-csv
```

**Success Response (200):**
The API returns a summary of the operation.

```json
{
  "message": "CSV processed successfully",
  "recordsProcessed": 50000,
  "errors": 2
}

**Console Output (Server-side):**
Upon success, the age distribution report is printed directly to the server console.


Processing CSV file: sample_data.csv
Processed batch: 25 records
==================================================
AGE DISTRIBUTION REPORT
==================================================
Age-Group		% Distribution
----------------------------------------
< 20		8%
20 to 40		68%
40 to 60		24%
----------------------------------------
Total Users: 25
==================================================

```
-----

### 2\. Get Error Log

Retrieves the error log generated from the last `POST` request.

  * **Endpoint:** `GET /error-log`
  * **Success Response (200):**
    ```plaintext
    Line 1024: Invalid age value: "pi". Age must be a valid positive number.
    Line 5030: Invalid age value: "-10". Age must be a valid positive number.
    ```

-----

### 3\. Health Check

A simple endpoint to confirm the API is running.

  * **Endpoint:** `GET /`
  * **Success Response (200):**
    ```json
    {
      "message": "CSV to JSON Converter API",
      "usage": "POST /api/process-csv with CSV file in 'csvFile' field",
      "example": "curl -X POST -F \"csvFile=@sample_data.csv\" http://localhost:3000/api/process-csv"
    }
    ```

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/csv-to-json-converter.git
    cd csv-to-json-converter
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up your PostgreSQL database:
    ```sql
    CREATE DATABASE csv_converter;
    ```
4.  Create a `config.env` file in the root and add your credentials:
    ```env
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=csv_converter
    DB_USER=postgres
    DB_PASSWORD=your_password
    ```

## Usage

Start the application server:

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will be running at `http://localhost:3000`.

## Project Structure

*(Based on your provided files)*

```
csv-to-json-converter/
├── app.js                    # Express server, API endpoints, middleware
├── services/
│   ├── parser.js             # Custom streaming CSV parser
│   ├── databaseService.js    # All PostgreSQL logic (pool, batching)
│   └── ageDistriService.js   # Age analysis (console report)
├── temp/                     # (Gitignored) For temporary file uploads
├── config.env                # (Gitignored) Environment configuration
├── package.json
└── README.md
```

## CSV Format Requirements

### Mandatory Fields

Every CSV file must contain these fields in the header:

  * `name.firstName`
  * `name.lastName`
  * `age`

### Example CSV Format

```csv
name.firstName,name.lastName,age,address.line1,address.city,gender
Rohit,Prasad,35,"A-563 Rakshak Society",Pune,male
Priya,Sharma,28,"123 Main Street",Mumbai,female
```

## Database Schema

The application automatically creates a `users` table:

```sql
CREATE TABLE public.users (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,        -- Combined firstName + lastName
  age INTEGER NOT NULL,
  address JSONB NULL,           -- Address object
  additional_info JSONB NULL,   -- Other properties as JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
## Performance Optimizations

- **Streaming Processing**: Uses Node.js streams to process large files without loading everything into memory
- **Batch Operations**: Processes data in batches of 1,000 records for optimal performance
- **Memory Efficient**: Can handle files with 50,000+ records without memory issues
- **Database Batching**: Uses batch inserts instead of individual record inserts
- **Simple Logic**: Removed complex validation and error handling for better performance

### Testing
Test the API with the included sample data:
```bash
# Using curl
curl -X POST -F "csvFile=@sample_data.csv" http://localhost:3000/api/process-csv

# Using Postman
POST http://localhost:3000/api/process-csv
Body: form-data, Key: csvFile, Type: File, Value: sample_data.csv
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request
