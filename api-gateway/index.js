const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

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

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();
const PORT = process.env.PORT || 4000;

// Service URLs
const AUTH_SERVICE = 'http://localhost:5001';
const PHONE_NUMBER_SERVICE = 'http://localhost:3001';
const COUNTRY_CODE_SERVICE = 'http://localhost:5000';

// Basic Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Adjusted Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit
  message: JSON.stringify({
    error: 'Rate limit exceeded',
    message: 'Too many requests from this IP, please try again later'
  }),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    const verifyResponse = await axios.post(`${AUTH_SERVICE}/verify`, { token });
    
    if (!verifyResponse.data.valid) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = verifyResponse.data.user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Proxy options with proper error handling
const proxyOptions = {
  changeOrigin: true,
  pathRewrite: {
    '^/api/': '/'
  },
  onError: (err, req, res) => {
    logger.error('Proxy Error:', err);
    res.status(500).json({
      error: 'Proxy error',
      message: 'Service temporarily unavailable'
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info(`Proxied Request: ${req.path}`);
    if (proxyRes.statusCode === 429) {
      proxyRes.statusCode = 429;
      proxyRes.statusMessage = 'Too Many Requests';
    }
  }
};

// Updated Proxy Middleware
const phoneNumberProxy = createProxyMiddleware({ 
  ...proxyOptions,
  target: PHONE_NUMBER_SERVICE,
});

const countryCodeProxy = createProxyMiddleware({ 
  ...proxyOptions,
  target: COUNTRY_CODE_SERVICE,
});

// Auth Routes
app.post('/auth/login', async (req, res) => {
  try {
    const response = await axios.post(`${AUTH_SERVICE}/login`, req.body);
    res.json(response.data);
  } catch (error) {
    logger.error('Login Error:', error);
    res.status(error.response?.status || 500)
      .json(error.response?.data || { error: 'Internal server error' });
  }
});

// Protected Proxy Routes
app.use('/phone-number', authenticate, phoneNumberProxy);
app.use('/country-code', authenticate, countryCodeProxy);

// Protected Composite Endpoints
app.get('/generate-validated-phone-number', authenticate, async (req, res) => {
  try {
    const { countryCode } = req.query;

    if (!countryCode) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Country code is required'
      });
    }

    const validationResponse = await axios.get(
      `${COUNTRY_CODE_SERVICE}/validate-country-code`,
      { 
        params: { code: countryCode },
        timeout: 5000
      }
    );

    if (validationResponse.data.isValid) {
      const phoneResponse = await axios.get(
        `${PHONE_NUMBER_SERVICE}/generate-phone-number`,
        { 
          params: { countryCode },
          timeout: 5000
        }
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
    logger.error('Phone Number Generation Error:', error);
    handleServiceError(error, res);
  }
});

app.get('/generate-bulk-numbers', authenticate, async (req, res) => {
  try {
    const { countryCode, count = 10 } = req.query;

    if (!countryCode) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Country code is required'
      });
    }

    const validationResponse = await axios.get(
      `${COUNTRY_CODE_SERVICE}/validate-country-code`,
      { 
        params: { code: countryCode },
        timeout: 5000
      }
    );

    if (validationResponse.data.isValid) {
      const phoneResponse = await axios.get(
        `${PHONE_NUMBER_SERVICE}/generate-bulk`,
        { 
          params: { countryCode, count },
          timeout: 10000
        }
      );

      res.json({
        countryInfo: validationResponse.data,
        phoneNumbers: phoneResponse.data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        error: 'Invalid country code',
        message: 'Please provide a valid country code'
      });
    }
  } catch (error) {
    logger.error('Bulk Generation Error:', error);
    handleServiceError(error, res);
  }
});

// Error handling helper
function handleServiceError(error, res) {
  if (error.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'One or more required services are currently unavailable'
    });
  }

  if (error.response?.status === 429) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Please wait before making more requests'
    });
  }

  if (error.code === 'ECONNABORTED') {
    return res.status(504).json({
      error: 'Gateway timeout',
      message: 'The request took too long to complete'
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Error:', err);
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