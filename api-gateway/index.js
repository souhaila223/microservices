const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');

// Logger Configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();
const PORT = process.env.PORT || 4000;

// Service URLs
const PHONE_NUMBER_SERVICE = 'http://localhost:3001';
const COUNTRY_CODE_SERVICE = 'http://localhost:5000';

// Middleware
app.use(helmet()); // Adds security headers
app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(morgan('combined')); // HTTP request logging

// Rate Limiter Middleware
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});
app.use(apiLimiter);

// Proxy Middleware
const phoneNumberProxy = createProxyMiddleware({ 
  target: PHONE_NUMBER_SERVICE, 
  changeOrigin: true,
  onProxyRes: (proxyRes, req, res) => {
    logger.info(`Proxied Phone Number Request: ${req.path}`);
  }
});

const countryCodeProxy = createProxyMiddleware({ 
  target: COUNTRY_CODE_SERVICE, 
  changeOrigin: true,
  onProxyRes: (proxyRes, req, res) => {
    logger.info(`Proxied Country Code Request: ${req.path}`);
  }
});

// Proxy Routes
app.use('/phone-number', phoneNumberProxy);
app.use('/country-code', countryCodeProxy);

// Composite Endpoints
app.get('/generate-validated-phone-number', async (req, res) => {
  try {
    const { countryCode } = req.query;

    // Validate country code
    const validationResponse = await axios.get(
      `${COUNTRY_CODE_SERVICE}/validate-country-code`, 
      { params: { code: countryCode } }
    );

    // If country code is valid, generate phone number
    if (validationResponse.data.isValid) {
      const phoneResponse = await axios.get(
        `${PHONE_NUMBER_SERVICE}/generate-phone-number`, 
        { params: { countryCode } }
      );

      res.json({
        countryInfo: validationResponse.data,
        phoneNumber: phoneResponse.data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({ 
        error: 'Invalid country code',
        message: 'Please provide a valid country code' 
      });
    }
  } catch (error) {
    logger.error('Composite Endpoint Error', { 
      error: error.message, 
      stack: error.stack 
    });

    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to generate validated phone number' 
    });
  }
});



// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Error', { 
    error: err.message, 
    stack: err.stack 
  });

  res.status(500).json({
    error: 'Unexpected error occurred',
    message: err.message
  });
});

// Start Server
app.listen(PORT, () => {
  logger.info(`🚪 API Gateway running on port ${PORT}`);
  console.log(`🌐 Gateway available at: http://localhost:${PORT}`);
});