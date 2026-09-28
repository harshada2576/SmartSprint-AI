import json
import sys
from pathlib import Path

import joblib
import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[3]

MODEL_PATH = (
    ROOT_DIR
    / "ai"
    / "ml"
    / "models"
    / "final_priority_model.joblib"
)

FEATURES = [
    "category",
    "business_value",
    "customer_importance",
    "urgency",
    "risk",
]

CLASS_NAMES = {
    0: "low",
    1: "medium",
    2: "high",
}


def main():
    try:
        # Check that the trained model exists
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found: {MODEL_PATH}"
            )

        # Read the complete JSON payload from stdin
        payload = sys.stdin.read().strip()

        if not payload:
            raise ValueError(
                "No requirement data received."
            )

        data = json.loads(payload)

        # The batch API expects a list of requirements
        if not isinstance(data, list):
            raise ValueError(
                "Expected a list of requirements."
            )

        # Handle empty input
        if len(data) == 0:
            print(
                json.dumps(
                    {
                        "success": True,
                        "predictions": [],
                    }
                )
            )
            return

        rows = []

        # Prepare model input
        for item in data:
            if not isinstance(item, dict):
                raise ValueError(
                    "Invalid requirement data."
                )

            row = {}

            for feature in FEATURES:
                if feature not in item:
                    raise ValueError(
                        f"Missing required feature: {feature}"
                    )

                row[feature] = item[feature]

            rows.append(row)

        # Convert input into DataFrame
        df = pd.DataFrame(rows)

        # Load trained XGBoost model
        model = joblib.load(MODEL_PATH)

        # Generate predictions for the complete batch
        predictions = model.predict(df)
        probabilities = model.predict_proba(df)

        results = []

        # Convert predictions into API-friendly JSON
        for index, prediction in enumerate(predictions):
            probability_map = {
                CLASS_NAMES[class_index]: round(
                    float(probability) * 100,
                    2,
                )
                for class_index, probability in enumerate(
                    probabilities[index]
                )
            }

            confidence = max(
                probability_map.values()
            )

            results.append(
                {
                    "suggestedPriority": CLASS_NAMES[
                        int(prediction)
                    ],
                    "confidenceScore": confidence,
                    "probabilities": probability_map,
                }
            )

        # Return all predictions in the same order
        # as the input requirements
        print(
            json.dumps(
                {
                    "success": True,
                    "predictions": results,
                }
            )
        )

    except Exception as error:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": str(error),
                }
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()