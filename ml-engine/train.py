import argparse
import json
import pickle
from datetime import datetime

import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split


def parse_args():
    parser = argparse.ArgumentParser(description="Train IDS models and export metrics.")
    parser.add_argument(
        "--dataset",
        default="UNSW_NB15_training-set.csv",
        help="Path to CSV dataset used for training.",
    )
    parser.add_argument(
        "--model",
        default="model.pkl",
        help="Output path for the trained model file.",
    )
    parser.add_argument(
        "--metrics",
        default="metrics.json",
        help="Output path for training metrics JSON.",
    )
    return parser.parse_args()


def build_metric_block(y_true, y_pred, y_prob):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
        "auc_roc": float(roc_auc_score(y_true, y_prob)),
        "confusion_matrix": {
            "tp": int(tp),
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
        },
    }

def main():
    args = parse_args()

    df = pd.read_csv(args.dataset)

    # Remove unnamed index-like columns frequently present in exported CSVs.
    df = df.loc[:, ~df.columns.str.contains(r"^Unnamed")]

    if "label" not in df.columns:
        raise ValueError("Dataset must include a 'label' column.")

    drop_cols = ["label", "attack_cat"]
    if "id" in df.columns:
        drop_cols.append("id")

    X = df.drop(columns=[c for c in drop_cols if c in df.columns])
    y = df["label"]

    X = pd.get_dummies(X)
    X = X.replace([float("inf"), float("-inf")], 0).fillna(0)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    rf = RandomForestClassifier(
        n_estimators=200,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)

    xgb_model = xgb.XGBClassifier(
        eval_metric="logloss",
        random_state=42,
        n_estimators=300,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
    )
    xgb_model.fit(X_train, y_train)

    rf_pred = rf.predict(X_test)
    xgb_pred = xgb_model.predict(X_test)
    rf_prob = rf.predict_proba(X_test)[:, 1]
    xgb_prob = xgb_model.predict_proba(X_test)[:, 1]

    print("\nRandom Forest Accuracy:", accuracy_score(y_test, rf_pred))
    print("XGBoost Accuracy:", accuracy_score(y_test, xgb_pred))

    print("\nClassification Report (RF):\n", classification_report(y_test, rf_pred))
    print("\nClassification Report (XGB):\n", classification_report(y_test, xgb_pred))

    metrics = {
        "dataset": args.dataset,
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "sample_count": int(len(df)),
        "feature_count": int(len(X.columns)),
        "random_forest": build_metric_block(y_test, rf_pred, rf_prob),
        "xgboost": build_metric_block(y_test, xgb_pred, xgb_prob),
    }

    with open(args.model, "wb") as model_file:
        pickle.dump((rf, xgb_model, X.columns), model_file)

    with open(args.metrics, "w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2)

    print("\nModel trained and saved successfully")


if __name__ == "__main__":
    main()