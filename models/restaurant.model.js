// models/restaurant.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

// Restaurant Schema
const restaurantSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  placeId: {
    type: String,
    unique: true,
    sparse: true
  },
  description: {
    type: String,
    trim: true
  },
  location: {
    address: {
      type: String,
      trim: true
    },
    coordinates: {
      lat: {
        type: Number
      },
      lng: {
        type: Number
      }
    }
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  userRatingsTotal: {
    type: Number,
    default: 0
  },
  priceLevel: {
    type: Number,
    min: 0,
    max: 4
  },
  photos: [{
    reference: String,
    url: String,
    width: Number,
    height: Number
  }],
  specialties: [{
    type: String,
    trim: true
  }],
  cuisineType: [{
    type: String,
    trim: true
  }],
  openingHours: [{
    type: String
  }],
  website: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
restaurantSchema.index({ name: 'text', description: 'text' });
restaurantSchema.index({ 'location.coordinates': '2dsphere' });

// Create and export Restaurant model
const Restaurant = mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;