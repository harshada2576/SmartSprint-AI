from pathlib import Path
import json

import numpy as np
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT_DIR / "seed" / "requirements.json"

TARGET = "priority"

LABEL_MAP = {
    "low": 0,
    "medium": 1,
    "high": 2,
}


def main():
    print("=" * 70)
    print("SMARTSPRINT AI - TEXT-ONLY PRIORITY MODEL")
    print("=" * 70)

    with DATA_PATH.open(
        "r",
        encoding="utf-8",
    ) as file:
        records = json.load(file)

    df = pd.DataFrame(records)

    # Combine title and description.
    text = (
        df["title"].fillna("").astype(str)
        + " "
        + df["description"].fillna("").astype(str)
    )

    y = df[TARGET].map(LABEL_MAP)

    print(f"\nDataset: {len(df)} requirements")

    cv = StratifiedKFold(
        n_splits=5,
        shuffle=True,
        random_state=42,
    )

    accuracies = []
    macro_f1_scores = []
    balanced_accuracies = []

    for fold, (train_idx, test_idx) in enumerate(
        cv.split(text, y),
        start=1,
    ):
        text_train = text.iloc[train_idx]
        text_test = text.iloc[test_idx]

        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]

        # Fit TF-IDF only on the training fold.
        vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 2),
            min_df=2,
            max_df=0.95,
            sublinear_tf=True,
        )

        X_train = vectorizer.fit_transform(
            text_train
        )

        X_test = vectorizer.transform(
            text_test
        )

        model = LogisticRegression(
            max_iter=3000,
            class_weight=None,
            random_state=42,
        )

        model.fit(
            X_train,
            y_train,
        )

        y_pred = model.predict(X_test)

        accuracy = accuracy_score(
            y_test,
            y_pred,
        )

        macro_f1 = f1_score(
            y_test,
            y_pred,
            average="macro",
        )

        balanced_accuracy = balanced_accuracy_score(
            y_test,
            y_pred,
        )

        accuracies.append(accuracy)
        macro_f1_scores.append(macro_f1)
        balanced_accuracies.append(
            balanced_accuracy
        )

        print(
            f"\nFold {fold}:"
            f" Accuracy={accuracy:.4f},"
            f" Macro F1={macro_f1:.4f},"
            f" Balanced Accuracy={balanced_accuracy:.4f}"
        )

    print("\n" + "=" * 70)
    print("5-FOLD CROSS-VALIDATION RESULTS")
    print("=" * 70)

    print(
        f"\nMean Accuracy: "
        f"{np.mean(accuracies):.4f} "
        f"+/- {np.std(accuracies):.4f}"
    )

    print(
        f"Mean Macro F1: "
        f"{np.mean(macro_f1_scores):.4f} "
        f"+/- {np.std(macro_f1_scores):.4f}"
    )

    print(
        f"Mean Balanced Accuracy: "
        f"{np.mean(balanced_accuracies):.4f} "
        f"+/- {np.std(balanced_accuracies):.4f}"
    )


if __name__ == "__main__":
    main()