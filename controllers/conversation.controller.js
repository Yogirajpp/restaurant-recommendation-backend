// controllers/conversation.controller.js
import promptService from '../services/prompt.service.js';
import logger from '../utils/logger.js';

/**
 * Process user conversation input and provide restaurant recommendations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response
 */
const processUserInput = async (req, res) => {
  try {
    const { userInput, userLocation } = req.body;
    
    if (!userInput) {
      return res.status(400).json({
        success: false,
        message: 'User input is required'
      });
    }
    
    // Process the user input through our prompt service
    const result = await promptService.processUserQuery(userInput, userLocation);
    
    // If we need location clarification, return early
    if (result.needsLocationClarification) {
      return res.status(200).json(result);
    }
    
    // Return the processed result
    return res.status(200).json(result);
  } catch (error) {
    logger.error(`Error processing user input: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Clarify location when multiple options are available
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response
 */
const clarifyLocation = async (req, res) => {
  try {
    const { userInput, locationId } = req.body;
    
    if (!userInput || !locationId) {
      return res.status(400).json({
        success: false,
        message: 'User input and location ID are required'
      });
    }
    
    // Extract query components
    const extractionResult = await promptService.extractQueryComponents(userInput);
    
    if (!extractionResult.success) {
      return res.status(500).json(extractionResult);
    }
    
    // Build search query based on extracted components
    let searchQuery = '';
    
    if (extractionResult.cuisine) {
      searchQuery += extractionResult.cuisine + ' ';
    }
    
    searchQuery += 'restaurants ';
    
    if (extractionResult.preferences) {
      searchQuery += extractionResult.preferences;
    }
    
    searchQuery = searchQuery.trim();
    if (!searchQuery) {
      searchQuery = 'restaurants'; 
    }
    
    // Get recommendations using the clarified location
    const recommendationsResult = await promptService.getRecommendationsForQuery(locationId, searchQuery);
    
    if (!recommendationsResult.success) {
      return res.status(500).json(recommendationsResult);
    }
    
    // Generate natural language response
    const naturalResponse = await promptService.generateNaturalResponse({
      location: recommendationsResult.location.address,
      query: userInput,
      searchQuery,
      recommendations: recommendationsResult.recommendations
    });
    
    return res.status(200).json({
      success: true,
      location: recommendationsResult.location,
      recommendations: recommendationsResult.recommendations,
      naturalResponse
    });
  } catch (error) {
    logger.error(`Error clarifying location: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

export default {
  processUserInput,
  clarifyLocation
};