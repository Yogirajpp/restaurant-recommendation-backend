// routes/conversation.routes.js
import express from 'express';
import conversationController from '../controllers/conversation.controller.js';

const router = express.Router();

// Process user input for restaurant recommendations
router.post('/process', conversationController.processUserInput);

// Handle location clarification
router.post('/clarify-location', conversationController.clarifyLocation);

export default router;