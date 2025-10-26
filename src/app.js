const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: './config.env' });
const tempFolderPath = path.join(__dirname, 'temp');

const parser = require('./services/parser');
const databaseService = require('./services/databaseService');
const ageDistriService = require('./services/ageDistriService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares for parsing request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file upload (temporary csv file from the request that can be cleaned up after processing, by uncommenting the line fs.unlinkSync(filePath);)
const upload = multer({ 
  dest: tempFolderPath,
  fileFilter: (req, file, cb) => {

    const ext = path.extname(file.originalname).toLowerCase();
    
    if (ext !== '.csv') {
      return cb(new Error('Only .csv files are allowed!'), false);
    }
    
    // If it is a .csv, accept the file
    cb(null, true);
  }
});

const cleanupTempFolder = (req, res, next) => {

    try {
     
      if (fs.existsSync(tempFolderPath)) {
        console.log('Cleaning up old temp folder contents...');
        
        
        const files = fs.readdirSync(tempFolderPath);
      
        for (const file of files) {
          fs.unlinkSync(path.join(tempFolderPath, file));
        }
        
      } else {
        // If the folder doesn't exist, create it so multer doesn't fail
        fs.mkdirSync(tempFolderPath);
        console.log('Temp folder created.');
      }
    } catch (err) {
        console.error('Failed to clean or create temp folder:', err);
        // If cleanup fails, we'll still proceed, but log the error
    }
    
    // Continue to the next middleware (which is multer)
    next(); 
  }

// API endpoint for parsing and processing the csv file
app.post('/api/process-csv', cleanupTempFolder, upload.single('csvFile'), async (req, res) => {
  
  try {
    const logFilePath = path.join(__dirname, 'error_log.txt');
    if (fs.existsSync(logFilePath)) {
      fs.unlinkSync(logFilePath);
    }

    if (!req.file) {
      return res.status(400).json({ 
        error: 'No CSV file provided. Please upload a CSV file using the key "csvFile"' 
      });
    }
    //clears existing users table in pg database
    await databaseService.clearUsersTable();

    const filePath = req.file.path;
    console.log(`Processing CSV file: ${req.file.originalname}`);

    let totalProcessed = 0;
    let totalErrors = 0;

    // Process CSV with streaming and batch uploads
    const result = await parser.parseCSVFile(filePath, async (batch) => {
      try {
        await databaseService.uploadUsersBatch(batch);
        totalProcessed += batch.length;
        console.log(`Processed batch: ${batch.length} records`);
      } catch (error) {
        totalErrors += batch.length;
        console.error(`Batch upload failed: ${error.message}`);
      }
    });
    
    // Calculate and display age distribution
    await ageDistriService.calculateAndDisplayAgeDistribution();


    const finalTotalErrors = (result.totalErrors || 0) + totalErrors;
    const response = {
      message: 'CSV processed successfully',
      recordsProcessed: totalProcessed,
      errors: finalTotalErrors
    };
    
    // If any errors occurred
    if (finalTotalErrors > 0 && fs.existsSync('error_log.txt')) {
      response.errorLog = '/error-log';
    }
    
    res.json(response);

  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: error.message });
    }
});

// check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'CSV to JSON Converter API',
    usage: 'POST /api/process-csv with CSV file in "csvFile" field',
    example: 'curl -X POST -F "csvFile=@sample_data.csv" http://localhost:3000/api/process-csv'
  });
});

app.get('/error-log', (req, res) => {
  const filePath = path.join(__dirname, 'error_log.txt');

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'No error log found' });
  }
});



// Error handling middleware
app.use((error, req, res, next) => {

  if (error.message === 'Only .csv files are allowed!') {
    return res.status(400).json({ 
      error: 'Invalid file type. Only .csv files are allowed!' 
    });
  }
  else{
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  //database connection
  try {
    await databaseService.initializeDatabase();
    console.log('Database connection established');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
});

module.exports = app;
