import time, json
import pandas as pd
from kafka import KafkaProducer
import math

# 🔥 LOAD DATA
df = pd.read_csv("UNSW_NB15_training-set.csv")

# 🔥 REMOVE USELESS COLUMNS
df = df.loc[:, ~df.columns.str.contains('^Unnamed')]

# 🔥 SHUFFLE DATA (IMPORTANT FOR MIXED TRAFFIC)
df = df.sample(frac=1).reset_index(drop=True)

producer = KafkaProducer(
    bootstrap_servers='localhost:9092',
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

for _, row in df.iterrows():
    data = row.to_dict()

    # 🔥 CLEAN DATA BEFORE SENDING
    clean_data = {}
    for k, v in data.items():
        if pd.isna(v) or (isinstance(v, float) and math.isinf(v)):
            clean_data[k] = 0
        else:
            clean_data[k] = v

    # 🔥 DEBUG (IMPORTANT)
    print("Sending sample:", {k: clean_data[k] for k in list(clean_data)[:5]})
    print("Label:", clean_data.get("label"))

    producer.send('network_traffic', clean_data)

    time.sleep(0.3)