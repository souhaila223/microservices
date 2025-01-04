const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { faker } = require('@faker-js/faker');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// API Gateway URL
const API_GATEWAY_URL = 'http://localhost:4000';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Phone Number Generation Strategies
const phoneNumberGenerators = {
  generateNumber: async (countryCode) => {
    try {
      // Fetch country details to get the phone code
      const response = await axios.get(
        `${API_GATEWAY_URL}/country-code/validate-country-code`, 
        { params: { code: countryCode } }
      );

      // Get phone code and remove the '+' if present
      const phoneCode = response.data.phoneCode.replace('+', '');

      // Generic formatting for phone numbers
      const formats = [
        `+${phoneCode} ## #### ####`,    // International format with space
        `+${phoneCode}##########`,        // Compact international format
        `+${phoneCode} (##) ###-####`,    // Format with parentheses
        `+${phoneCode} ###-###-####`      // Alternative format with hyphens
      ];

      // Select a random format
      const format = faker.helpers.arrayElement(formats);
      
      // Generate phone number by replacing # with random digits
      const phoneNumber = format.replace(/\#/g, () => faker.number.int({min: 0, max: 9}));

      return {
        phoneNumber: phoneNumber,
        type: 'country-specific',
        countryCode: countryCode,
        phoneCode: `+${phoneCode}`
      };
    } catch (error) {
      // Fallback to generic generation if validation fails
      console.error('Phone code validation error:', error);
      
      const genericFormats = [
        '+## ## #### ####',
        '+##########',
        '+## (##) ###-####',
        '+## ###-###-####'
      ];

      const format = faker.helpers.arrayElement(genericFormats);
      const phoneNumber = format.replace(/\#/g, () => faker.number.int({min: 0, max: 9}));

      return {
        phoneNumber: phoneNumber,
        type: 'generic',
        countryCode: countryCode
      };
    }
  },

  random: () => ({
    phoneNumber: faker.phone.number('+############'),
    type: 'random'
  })
};

// ROUTES
app.get('/generate-phone-number', async (req, res) => {
  try {
    const { countryCode } = req.query;

    // If country code is provided, generate country-specific number
    if (countryCode) {
      // Validate country code is not empty and contains only alphanumeric characters
      if (!/^[A-Za-z0-9]+$/.test(countryCode)) {
        return res.status(400).json({ 
          error: 'Invalid country code format', 
          message: 'Country code should contain only letters or numbers'
        });
      }

      const phoneData = await phoneNumberGenerators.generateNumber(countryCode);
      
      return res.json({
        success: true,
        data: phoneData,
        timestamp: new Date().toISOString()
      });
    }

    // If no country code, generate random phone number
    const phoneData = phoneNumberGenerators.random();
    
    res.json({
      success: true,
      data: phoneData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Phone Number Generation Error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to generate phone number' 
    });
  }
});

// Route for generation strategies
app.get('/generation-strategies', (req, res) => {
  res.json({
    strategies: ['random', 'country-specific'],
    description: 'Supports phone number generation for any country code using phone code'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`📱 Phone Number Service running on port ${PORT}`);
  console.log(`🌐 Available at: http://localhost:${PORT}`);
});