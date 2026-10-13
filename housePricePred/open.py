import numpy as np
import pandas as pd
from matplotlib import pyplot as plt
from sklearn.preprocessing import LabelEncoder

df = pd.read_csv('house_price_dataset.csv')
print(df.head())
print(df.shape)
print("==============================================")
print("Description of the dataset:")
print("==============================================")
df.describe()
df.info()
print("==============================================")
print("Checking for duplicates and null values:")
print("==============================================")
print(df.duplicated().sum())
print(df.isnull().sum())