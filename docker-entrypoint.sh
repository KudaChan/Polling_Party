#!/bin/sh
set -e

echo "Waiting for Kafka..."
while ! nc -z kafka 9092; do
    sleep 1
done
echo "Kafka is up!"

echo "Waiting for PostgreSQL..."
while ! nc -z postgres 5432; do
    sleep 1
done
echo "PostgreSQL is up!"

echo "Starting application..."
exec "$@"