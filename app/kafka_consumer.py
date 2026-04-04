import json
import logging
import os
import threading

import requests
from kafka import KafkaConsumer
from kafka.errors import KafkaError, NoBrokersAvailable

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
KAFKA_ENABLED = os.getenv("ENABLE_KAFKA_CONSUMER", "false").strip().lower() in {"1", "true", "yes", "on"}
INGEST_URL = os.getenv("KAFKA_INGEST_URL", "http://127.0.0.1:8000/events/ingest")
TOPICS = ["crowd_events", "intrusion_events"]


def consume_kafka_messages():
    try:
        consumer = KafkaConsumer(
            *TOPICS,
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_deserializer=lambda value: json.loads(value.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=True,
            group_id="alert_consumer_group",
            consumer_timeout_ms=3000,
            request_timeout_ms=3000,
            session_timeout_ms=10000,
        )
    except NoBrokersAvailable:
        logger.warning(
            "Kafka consumer not started because no broker is available at %s. "
            "Set ENABLE_KAFKA_CONSUMER=false to disable it or start Kafka to enable ingestion.",
            KAFKA_BOOTSTRAP,
        )
        return
    except KafkaError as error:
        logger.warning("Kafka consumer startup failed: %s", error)
        return
    except Exception as error:
        logger.warning("Kafka consumer disabled due to unexpected startup error: %s", error)
        return

    logger.info("Kafka consumer listening to topics: %s", ", ".join(TOPICS))

    for message in consumer:
        event = message.value
        topic = message.topic
        logger.info("Received Kafka event from %s", topic)

        try:
            response = requests.post(
                INGEST_URL,
                json=event,
                timeout=5,
            )
            logger.info("Forwarded Kafka event to ingest endpoint with status %s", response.status_code)
        except Exception as error:
            logger.warning("Failed to call ingest endpoint for Kafka event: %s", error)


def start_consumer():
    if not KAFKA_ENABLED:
        logger.info("Kafka consumer is disabled. Set ENABLE_KAFKA_CONSUMER=true to enable it.")
        return

    thread = threading.Thread(target=consume_kafka_messages, daemon=True, name="kafka-consumer")
    thread.start()
