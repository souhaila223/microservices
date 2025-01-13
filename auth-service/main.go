package main

import (
    "context"
    "log"
    "os"

    "github.com/gin-gonic/gin"
    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
    "golang.org/x/crypto/bcrypt"
    
    "auth-service/handlers"
    "auth-service/models"
)

func main() {
    // MongoDB setup
    ctx := context.Background()
    mongoURI := getEnvOrDefault("MONGODB_URI", "mongodb://localhost:27017")
    client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
    if err != nil {
        log.Fatal(err)
    }
    defer client.Disconnect(ctx)

    collection := client.Database("auth-service").Collection("users")
    
    // Initialize handlers
    jwtSecret := []byte(getEnvOrDefault("JWT_SECRET", "your-secret-key"))
    handlers.InitHandlers(collection, jwtSecret)

    // Create indices
    _, err = collection.Indexes().CreateOne(ctx, mongo.IndexModel{
        Keys:    bson.D{{Key: "username", Value: 1}},
        Options: options.Index().SetUnique(true),
    })
    if err != nil {
        log.Fatal(err)
    }

    // Initialize default user
    initializeDefaultUser(ctx, collection)

    // Setup Gin router
    router := gin.Default()
    router.Use(corsMiddleware())

    // Routes
    router.POST("/login", handlers.HandleLogin)
    router.POST("/verify", handlers.HandleVerify)

    // Start server
    port := getEnvOrDefault("PORT", "5001")
    log.Printf("🔐 Auth Service running on port %s", port)
    log.Printf("🌐 Available at: http://localhost:%s", port)
    router.Run(":" + port)
}

func initializeDefaultUser(ctx context.Context, collection *mongo.Collection) {
    var existingUser models.User
    err := collection.FindOne(ctx, bson.M{"username": "admin"}).Decode(&existingUser)
    if err == mongo.ErrNoDocuments {
        hashedPassword, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
        if err != nil {
            log.Fatal(err)
        }

        _, err = collection.InsertOne(ctx, models.User{
            Username: "admin",
            Password: string(hashedPassword),
        })
        if err != nil {
            log.Fatal(err)
        }
        log.Println("Default user created")
    }
}

func corsMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
        c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }

        c.Next()
    }
}

func getEnvOrDefault(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}