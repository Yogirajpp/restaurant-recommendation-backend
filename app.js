// server.js
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import recommendationRoutes from './routes/recommendation.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import appConfig from './config/app.config.js';
import logger from './utils/logger.js';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = appConfig.server.port;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/conversation', conversationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({
    success: false,
    message: 'Server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Connect to MongoDB and start server
mongoose.connect(appConfig.db.uri)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${appConfig.server.env} mode`);
    });
  })
  .catch((error) => {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  // Close server & exit process
  process.exit(1);
});