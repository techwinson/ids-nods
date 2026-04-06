from kafka import KafkaConsumer
import pickle, json, requests
import pandas as pd
import math
import warnings

warnings.filterwarnings("ignore")

rf, xgb_model, columns = pickle.load(open("model.pkl", "rb"))

consumer = KafkaConsumer(
    'network_traffic',
    bootstrap_servers='localhost:9092',
    value_deserializer=lambda x: json.loads(x.decode('utf-8'))
)

for msg in consumer:
    data = msg.value

    # Clean NaN and inf values to keep model inference stable.
    clean_data = {
        k: (0 if (pd.isna(v) or (isinstance(v, float) and math.isinf(v))) else v)
        for k, v in data.items()
    }

    observed_attack_type = clean_data.get("attack_cat")

    data_df = pd.DataFrame([clean_data])

    for col in ["label", "attack_cat", "id"]:
        if col in data_df.columns:
            data_df.drop(columns=[col], inplace=True)

    data_df = pd.get_dummies(data_df)

    data_df = data_df.reindex(columns=columns, fill_value=0)
    data_df = data_df.copy()

    rf_pred = rf.predict(data_df)[0]
    xgb_pred = xgb_model.predict(data_df)[0]
    rf_attack_prob = float(rf.predict_proba(data_df)[0][1])
    xgb_attack_prob = float(xgb_model.predict_proba(data_df)[0][1])

    print(f"RF: {rf_pred}, XGB: {xgb_pred}")

    result = "ATTACK" if (rf_pred == 1 and xgb_pred == 1) else "NORMAL"
    avg_attack_prob = (rf_attack_prob + xgb_attack_prob) / 2
    model_confidence = avg_attack_prob if result == "ATTACK" else (1 - avg_attack_prob)

    if result == "ATTACK":
        attack_type = (
            str(observed_attack_type)
            if observed_attack_type not in [None, "", 0, "Normal"]
            else "unknown_attack"
        )
        activity_type = attack_type
    else:
        attack_type = None
        activity_type = "normal"

    print("Prediction:", result)

    try:
        requests.post("http://localhost:5000/api/log", json={
            "data": clean_data,
            "prediction": result,
            "attackType": attack_type,
            "activityType": activity_type,
            "rfConfidence": rf_attack_prob,
            "xgbConfidence": xgb_attack_prob,
            "modelConfidence": model_confidence,
            "sourceIp": clean_data.get("srcip") or clean_data.get("src_ip"),
            "deviceId": clean_data.get("device") or clean_data.get("device_id")
        })
    except Exception as e:
        print("Backend error:", e)