// routes/recommendation.routes.js
import express from 'express';
import recommendationController from '../controllers/recommendation.controller.js';

const router = express.Router();

// Location search endpoint
router.get('/locations', recommendationController.searchLocations);

// Main recommendation endpoint
router.get('/', recommendationController.getRecommendations);

// Place details endpoint
router.get('/place/:placeId', recommendationController.getPlaceDetails);

// Text generation endpoint
router.post('/generate-text', recommendationController.generateText);

export default router;