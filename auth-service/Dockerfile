FROM golang:1.21.13-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download && go mod verify

# Copy the source code
COPY . .

# Build the application with specific flags
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o main .

EXPOSE 5001
CMD ["./main"]