const fs = require('fs');
const readline = require('readline');
const path = require('path');

class CSVParser {
  constructor() {
    this.mandatoryFields = ['name.firstName', 'name.lastName', 'age'];
    this.batchSize = 1000; // Process in batches of 1000 records (for efficiency while processing large files)
  }

  async parseCSVFile(filePath, onBatch = null) {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      const readL = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let headers = null;
      let batch = [];
      let totalProcessed = 0;
      let totalErrors = 0;
      let currLine = 0;

      readL.on('line', async (line) => {
        currLine++;
        
        try {
          if (!headers) {
            headers = this.parseCSVLine(line);
            this.validateMandatoryFields(headers);
            return;
          }

          if (line.trim() === '') return; // Skip empty lines

          const values = this.parseCSVLine(line);
          const parsedObject = this.convertRowToObject(headers, values);
          batch.push(parsedObject);

          // Process batch when it reaches batch size
          if (batch.length >= this.batchSize) {
            if (onBatch) {
              await onBatch(batch);
            }
            totalProcessed += batch.length;
            batch = [];
          }
        } catch (error) {
          totalErrors++;
        
          const errorMessage = `Line ${currLine}: ${error.message}\n`;
          
          // Append error to log file
          const logPath = path.join(__dirname, '../error_log.txt');
          console.log('Logging error:', errorMessage);

          try {
            fs.appendFileSync(logPath, errorMessage);
          } catch (logError) {
            console.error('Failed to write to error log:', logError.message);
          }
          
          console.warn(`Skipping row ${currLine} due to error: ${error.message}`);
        }
        
      });

      readL.on('close', async () => {
        try {
          // Process remaining records
          if (batch.length > 0) {
            if (onBatch) {
              await onBatch(batch);
            }
            totalProcessed += batch.length;
          }

          resolve({
            totalProcessed,
            totalErrors,
            headers
          });
        } catch (error) {
          reject(error);
        }
      });

      readL.on('error', reject);
    });
  }


  parseCSVLine(line) {
    const values = [];
    let current = '';
    let insideQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          insideQuotes = !insideQuotes;
          i++;
        }
      } else if (char === ',' && !insideQuotes) {
        // Field separator
        values.push(current.trim());
        current = '';
        i++;
      } else { //non field separator characters (e.g. spaces, tabs, newlines)
        current += char;
        i++;
      }
    }
    
   
    values.push(current.trim());
    
    return values;
  }


  validateMandatoryFields(headers) {
    const missingFields = this.mandatoryFields.filter(field => !headers.includes(field));
    
    if (missingFields.length > 0) {
      throw new Error(`Missing mandatory fields: ${missingFields.join(', ')}`);
    }
  }


  convertRowToObject(headers, values) {
    const result = {};
    const additionalInfo = {};

    // Process each field
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].trim();
      const value = values[i].trim();

      if (this.mandatoryFields.includes(header)) {
        // Validate age field
        if (header === 'age') {
          if (value === '' || isNaN(value) || parseInt(value) < 0) {
            throw new Error(`Invalid age value: "${value}". Age must be a valid positive number.`);
          }
        }
        
        this.setNestedProperty(result, header, value);
      } else {
        this.setNestedProperty(additionalInfo, header, value);
      }
    }

    // Add additional info to result
    if (Object.keys(additionalInfo).length > 0) {
      result.additional_info = additionalInfo;
    }

    return result;
  }


  setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    
    // Converting numeric strings to numbers for age field
    if (lastKey === 'age' && !isNaN(value)) {
      current[lastKey] = parseInt(value, 10);
    } else {
      current[lastKey] = value;
    }
  }
}

module.exports = new CSVParser();