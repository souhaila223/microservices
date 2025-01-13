const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { faker } = require('@faker-js/faker');
const phonenumbers = require('google-libphonenumber');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize phone number utility
const phoneUtil = phonenumbers.PhoneNumberUtil.getInstance();
const PNF = phonenumbers.PhoneNumberFormat;

app.use(cors());
app.use(bodyParser.json());

const phoneNumberGenerators = {
  getCountryMetadata: (countryCode) => {
    try {
      // Get region code metadata
      const regionCode = countryCode.toUpperCase();
      const supportedRegions = phoneUtil.getSupportedRegions();
      
      if (!supportedRegions.includes(regionCode)) {
        throw new Error('Unsupported country code');
      }

      // Get example number for region
      const exampleNumber = phoneUtil.getExampleNumber(regionCode);
      
      return {
        countryCode: regionCode,
        callingCode: exampleNumber.getCountryCode(),
        nationalNumberLength: exampleNumber.getNationalNumber().toString().length,
        example: phoneUtil.format(exampleNumber, PNF.INTERNATIONAL)
      };
    } catch (error) {
      console.error('Error getting country metadata:', error);
      return null;
    }
  },

  generateValidNumber: async (countryCode) => {
    try {
      const countryMetadata = phoneNumberGenerators.getCountryMetadata(countryCode);
      if (!countryMetadata) {
        throw new Error('Invalid country code or unsupported region');
      }

      let isValid = false;
      let phoneNumber;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isValid && attempts < maxAttempts) {
        attempts++;
        
        // Generate random digits based on example number length
        const nationalNumber = faker.string.numeric(countryMetadata.nationalNumberLength);
        const numberToParse = `+${countryMetadata.callingCode}${nationalNumber}`;
        
        try {
          // Parse and validate the generated number
          phoneNumber = phoneUtil.parse(numberToParse, countryCode);
          isValid = phoneUtil.isValidNumber(phoneNumber) && 
                    phoneUtil.isValidNumberForRegion(phoneNumber, countryCode);

          if (isValid) {
            return {
              phoneNumber: phoneUtil.format(phoneNumber, PNF.INTERNATIONAL),
              rawNumber: phoneUtil.format(phoneNumber, PNF.E164),
              nationalNumber: phoneNumber.getNationalNumber().toString(),
              countryCode: countryCode,
              type: 'validated',
              metadata: {
                callingCode: countryMetadata.callingCode,
                formatExample: countryMetadata.example
              }
            };
          }
        } catch (parseError) {
          console.error('Parse error:', parseError);
          continue;
        }
      }

      throw new Error('Failed to generate valid number after maximum attempts');

    } catch (error) {
      console.error('Phone generation error:', error);
      return null;
    }
  },

  generateBulk: async (countryCode, count = 10) => {
    const numbers = [];
    const requestedCount = Math.min(Math.max(parseInt(count) || 10, 1), 100);
    
    for (let i = 0; i < requestedCount; i++) {
      const number = await phoneNumberGenerators.generateValidNumber(countryCode);
      if (number) {
        numbers.push(number);
      }
    }
    return numbers;
  }
};

// Endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'phone-number-generator',
    supportedRegions: phoneUtil.getSupportedRegions()
  });
});

app.get('/supported-countries', (req, res) => {
  try {
    const countries = phoneUtil.getSupportedRegions()
      .map(countryCode => ({
        code: countryCode,
        metadata: phoneNumberGenerators.getCountryMetadata(countryCode)
      }))
      .filter(country => country.metadata !== null);

    res.json({
      success: true,
      count: countries.length,
      data: countries
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

app.get('/generate-phone-number', async (req, res) => {
  try {
    const { countryCode } = req.query;
    
    if (!countryCode) {
      return res.status(400).json({ 
        error: 'Country code is required'
      });
    }

    const phoneData = await phoneNumberGenerators.generateValidNumber(countryCode.toUpperCase());
    if (!phoneData) {
      return res.status(400).json({ 
        error: 'Failed to generate valid phone number',
        message: 'Country code may be invalid or unsupported'
      });
    }
    
    res.json({
      success: true,
      data: phoneData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Phone Number Generation Error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

app.get('/generate-bulk', async (req, res) => {
  try {
    const { countryCode, count = 10 } = req.query;
    
    if (!countryCode) {
      return res.status(400).json({ 
        error: 'Country code is required'
      });
    }

    const numbers = await phoneNumberGenerators.generateBulk(countryCode.toUpperCase(), parseInt(count));
    
    res.json({
      success: true,
      data: numbers,
      count: numbers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Bulk Generation Error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

app.listen(PORT, () => {
  console.log(`📱 Phone Number Service running on port ${PORT}`);
  console.log(`🌐 Available at: http://localhost:${PORT}`);
});