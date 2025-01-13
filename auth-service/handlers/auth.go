package handlers

import (
    "github.com/gin-gonic/gin"
    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/mongo"
    "golang.org/x/crypto/bcrypt"
    "auth-service/models"
)

var (
    collection *mongo.Collection
    jwtSecret  []byte
)

// InitHandlers initializes the handlers with the MongoDB collection and JWT secret
func InitHandlers(c *mongo.Collection, secret []byte) {
    collection = c
    jwtSecret = secret
}

// HandleLogin handles user login
func HandleLogin(c *gin.Context) {
    var user models.User
    if err := c.ShouldBindJSON(&user); err != nil {
        c.JSON(400, gin.H{"error": "Invalid request payload"})
        return
    }

    // Find the user in the database
    var dbUser models.User
    err := collection.FindOne(c, bson.M{"username": user.Username}).Decode(&dbUser)
    if err != nil {
        c.JSON(401, gin.H{"error": "Invalid username or password"})
        return
    }

    // Compare the password hash
    err = bcrypt.CompareHashAndPassword([]byte(dbUser.Password), []byte(user.Password))
    if err != nil {
        c.JSON(401, gin.H{"error": "Invalid username or password"})
        return
    }

    // Generate a JWT token (you can use a JWT library here)
    token := "example-jwt-token" // Replace with actual JWT generation logic
    c.JSON(200, gin.H{"token": token})
}

// HandleVerify verifies a JWT token
func HandleVerify(c *gin.Context) {
    token := c.GetHeader("Authorization")
    if token == "" {
        c.JSON(401, gin.H{"error": "Missing authorization token"})
        return
    }

    // Verify the JWT token (you can use a JWT library here)
    isValid := true // Replace with actual JWT verification logic
    if !isValid {
        c.JSON(401, gin.H{"error": "Invalid token"})
        return
    }

    c.JSON(200, gin.H{"message": "Token is valid"})
}