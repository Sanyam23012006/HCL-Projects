import pandas as pd
import numpy as np

# load data
df = pd.read_csv("cleaned_loan_default.csv")

print("Dataset loaded successfully!")
print("Shape:", df.shape)

# basic info

print("\nDuplicate rows:")
print(df.duplicated().sum())

# count missing values should be zero ..........

print("\nMissing values:")
print(df.isnull().sum())

print("\nMissing percentage:")
print(
    (df.isnull().sum() / len(df) * 100)
    .sort_values(ascending=False)
)
