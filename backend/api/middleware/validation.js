// Generic validation middleware factory
// Provides consistent validation and error responses

// Helper function for standardized error responses (matches server.js)
const sendResponse = (res, statusCode, data = null, errorMessage = null) => {
  const response = {
    status: statusCode
  };
  
  if (statusCode === 200) {
    response.data = data;
  } else {
    response.errorMessage = errorMessage;
  }
  
  return res.status(statusCode).json(response);
};

// Generic validation middleware factory
const validateRequest = (schema) => {
  return (req, res, next) => {
    const validation = schema(req);
    
    if (!validation.isValid) {
      return sendResponse(res, 400, null, validation.errorMessage);
    }
    
    next();
  };
};

module.exports = {
  validateRequest
};