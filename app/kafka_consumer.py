# app/kafka_consumer.py
from kafka import KafkaConsumer
import json
import requests
import threading
import os

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")  # prefer 29092 for Docker Kafka

# LISTEN TO BOTH TOPICS
TOPICS = ["crowd_events", "intrusion_events"]

def consume_kafka_messages():
    consumer = KafkaConsumer(
        *TOPICS,   # <--- LISTEN TO BOTH
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_deserializer=lambda v: json.loads(v.decode('utf-8')),
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        group_id="alert_consumer_group"   # <--- recommended
    )

    print(f"✅ Kafka Consumer listening to topics: {TOPICS}")

    for msg in consumer:
        event = msg.value
        topic = msg.topic
        
        print(f"\n📩 Received Event from '{topic}':")
        print(event)

        try:
            response = requests.post(
                "http://127.0.0.1:8000/ingest",
                json=event,
                timeout=5
            )
            print(f"📤 Ingest -> {response.status_code}: {response.text}")

        except Exception as e:
            print(f"❌ Error calling /ingest: {e}")


def start_consumer():
    t = threading.Thread(target=consume_kafka_messages, daemon=True)
    t.start()
