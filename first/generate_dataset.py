import csv
import random
import math
import uuid
import os

random.seed(42)

# ---------- helpers ----------
def clamp(v, lo, hi): return max(lo, min(hi, v))

def randn(mu=0, sigma=1):
    """Box-Muller normal sample."""
    u1 = random.random() or 1e-12
    u2 = random.random()
    return mu + sigma * math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)

def lognormal(mu, sigma):
    return math.exp(randn(mu, sigma))

def poisson(lam):
    L = math.exp(-lam)
    k, p = 0, 1.0
    while p > L:
        k += 1
        p *= random.random()
    return k - 1

def weighted_choice(choices, weights):
    total = sum(weights)
    r = random.random() * total
    cumul = 0
    for c, w in zip(choices, weights):
        cumul += w
        if r <= cumul:
            return c
    return choices[-1]

def sigmoid(x):
    try:
        return 1 / (1 + math.exp(-x))
    except OverflowError:
        return 0.0 if x < 0 else 1.0

# ---------- config ----------
NUM_ROWS = 100_000
OUT_FILE = r"C:\Users\NITRO\synthetic_loan_default.csv"

FIELDNAMES = [
    'customer_id','age','gender','marital_status','dependents','education',
    'employment_type','employment_years','annual_income','monthly_income',
    'residence_type','credit_score','credit_history_years','existing_loans',
    'existing_loan_amount','monthly_debt_payment','credit_card_utilization',
    'previous_defaults','late_payments_12m','credit_accounts',
    'recent_credit_inquiries','loan_id','loan_type','loan_amount',
    'loan_term_months','interest_rate','monthly_emi','loan_to_income_ratio',
    'down_payment','purpose','application_channel','account_balance',
    'avg_monthly_balance','salary_delay_days','emi_payment_history',
    'missed_payments_6m','missed_payments_12m','average_payment_delay_days',
    'loan_default'
]

MISSING_COLS = {
    'marital_status':    0.02,
    'employment_years':  0.015,
    'credit_card_utilization': 0.025,
    'account_balance':   0.018,
    'salary_delay_days': 0.012,
}

print(f"Generating {NUM_ROWS:,} rows ...")

loan_type_term = {
    'Personal':  [12, 24, 36, 48, 60],
    'Home':      [120, 180, 240, 360],
    'Auto':      [36, 48, 60, 72, 84],
    'Education': [60, 84, 120, 180],
    'Business':  [12, 24, 36, 48, 60, 120],
}
loan_type_lnmu = {
    'Personal': 11.5, 'Home': 15.0, 'Auto': 13.5,
    'Education': 13.0, 'Business': 14.0,
}
loan_type_lnsig = {
    'Personal': 0.5, 'Home': 0.5, 'Auto': 0.5,
    'Education': 0.5, 'Business': 0.8,
}

rows = []
defaults = 0

for i in range(NUM_ROWS):
    if i % 10000 == 0:
        print(f"  {i:,}/{NUM_ROWS:,} rows done ...")

    # ---- borrower ----
    cid   = str(uuid.uuid4())
    age   = random.randint(21, 65)
    gender= weighted_choice(['Male','Female','Other'], [0.50, 0.48, 0.02])
    ms    = weighted_choice(['Single','Married','Divorced','Widowed'], [0.30, 0.55, 0.10, 0.05])
    deps  = weighted_choice([0,1,2,3,4,5], [0.40, 0.25, 0.20, 0.10, 0.04, 0.01])
    edu   = weighted_choice(['High School','Graduate','Postgraduate'], [0.20, 0.50, 0.30])
    emp   = weighted_choice(['Salaried','Self-employed','Business','Contract','Unemployed'],
                            [0.50, 0.15, 0.15, 0.15, 0.05])

    emp_years_raw = max(0, int(age - 21 - max(0, randn(0, 3))))
    emp_years = 0 if emp == 'Unemployed' else emp_years_raw

    # income
    inc_mult = 1.0
    if edu == 'Graduate':    inc_mult = 1.5
    elif edu == 'Postgraduate': inc_mult = 2.2
    if emp == 'Unemployed':  inc_mult *= 0.1

    annual_income = int(lognormal(13, 0.8) * inc_mult)
    annual_income = clamp(annual_income, 60000, 100_000_000)
    monthly_income = annual_income // 12

    res_type = weighted_choice(['Owned','Rented','Mortgaged','Other'], [0.40, 0.40, 0.15, 0.05])

    # ---- credit profile ----
    base_score = clamp(randn(680, 80), 300, 850)
    ch_years   = max(0, int(emp_years - max(0, randn(2, 2))))
    ex_loans   = poisson(1)
    ex_loan_amt= int(ex_loans * max(0, lognormal(12, 0.8)))
    mth_debt   = int(ex_loan_amt * 0.05)

    cc_util    = clamp(randn(30, 25), 0, 100)
    prev_def   = weighted_choice([0, 1], [0.90, 0.10])
    late_12    = poisson(0.5)
    cr_accs    = max(1, poisson(3) + 1)
    cr_inq     = poisson(1.5)

    # credit score with correlations
    credit_score = int(clamp(
        base_score + (annual_income / 100000) * 2
               - (cc_util * 0.5)
               - (prev_def * 50)
               - (late_12 * 10),
        300, 850
    ))

    # ---- current loan ----
    lid       = str(uuid.uuid4())
    lt        = weighted_choice(['Personal','Home','Auto','Education','Business'],
                                [0.30, 0.30, 0.20, 0.10, 0.10])
    loan_amt  = int(clamp(lognormal(loan_type_lnmu[lt], loan_type_lnsig[lt]), 10000, 500_000_000))
    term      = random.choice(loan_type_term[lt])
    int_rate  = clamp(randn(10, 2) - (credit_score - 600) / 100 * 0.5, 5, 24)

    # EMI
    r = int_rate / 12 / 100
    try:
        if r == 0:
            emi = loan_amt / term
        else:
            emi = int(loan_amt * r * (1 + r)**term / ((1 + r)**term - 1))
    except (OverflowError, ZeroDivisionError):
        emi = 0

    lti_ratio = round(loan_amt / annual_income, 4) if annual_income > 0 else 0
    down_pay  = int(loan_amt * random.uniform(0.1, 0.3)) if lt in ('Home', 'Auto') else 0
    purpose   = weighted_choice(['Debt Consolidation','Home Improvement','Medical','Wedding','Other'],
                                [0.25, 0.20, 0.20, 0.15, 0.20])
    app_ch    = weighted_choice(['Online','Branch','Agent'], [0.60, 0.30, 0.10])

    # ---- behavioral ----
    acct_bal  = int(monthly_income * clamp(randn(1, 0.8), 0.05, 5))
    avg_bal   = int(acct_bal * clamp(randn(1, 0.1), 0.7, 1.3))
    sal_delay = max(0, int(random.expovariate(0.5)))
    emi_hist  = weighted_choice(['Excellent','Good','Average','Poor'], [0.50, 0.30, 0.15, 0.05])
    miss_6    = poisson(0.2)
    miss_12   = miss_6 + poisson(0.3)
    avg_delay = max(0, int(random.expovariate(1 / (miss_12 * 5 + 1))))

    # ---- default probability ----
    log_odds  = -4.0
    log_odds += (650 - credit_score) / 100 * 0.8
    log_odds += clamp(lti_ratio - 1, 0, 5) * 0.5
    dti = (emi + mth_debt) / (monthly_income + 1)
    log_odds += clamp(dti - 0.4, 0, 2) * 2.0
    log_odds += prev_def * 1.5
    log_odds += miss_12 * 0.3
    log_odds += late_12 * 0.2
    log_odds += (cc_util - 30) / 50 * 0.4
    log_odds -= emp_years * 0.05
    log_odds += cr_inq * 0.15
    if emp == 'Unemployed': log_odds += 1.2
    if emi_hist == 'Poor':  log_odds += 1.0
    elif emi_hist == 'Excellent': log_odds -= 0.5
    if cc_util > 80 and credit_score < 600: log_odds += 0.8
    log_odds += randn(0, 0.5)   # realistic noise

    prob = sigmoid(log_odds)
    default_val = 1 if random.random() < prob else 0
    if default_val: defaults += 1

    row = {
        'customer_id': cid,
        'age': age,
        'gender': gender,
        'marital_status': ms,
        'dependents': deps,
        'education': edu,
        'employment_type': emp,
        'employment_years': emp_years,
        'annual_income': annual_income,
        'monthly_income': monthly_income,
        'residence_type': res_type,
        'credit_score': credit_score,
        'credit_history_years': ch_years,
        'existing_loans': ex_loans,
        'existing_loan_amount': ex_loan_amt,
        'monthly_debt_payment': mth_debt,
        'credit_card_utilization': round(cc_util, 2),
        'previous_defaults': prev_def,
        'late_payments_12m': late_12,
        'credit_accounts': cr_accs,
        'recent_credit_inquiries': cr_inq,
        'loan_id': lid,
        'loan_type': lt,
        'loan_amount': loan_amt,
        'loan_term_months': term,
        'interest_rate': round(int_rate, 4),
        'monthly_emi': emi,
        'loan_to_income_ratio': lti_ratio,
        'down_payment': down_pay,
        'purpose': purpose,
        'application_channel': app_ch,
        'account_balance': acct_bal,
        'avg_monthly_balance': avg_bal,
        'salary_delay_days': sal_delay,
        'emi_payment_history': emi_hist,
        'missed_payments_6m': miss_6,
        'missed_payments_12m': miss_12,
        'average_payment_delay_days': avg_delay,
        'loan_default': default_val,
    }
    rows.append(row)

# inject missing values
print("Injecting missing values ...")
for col, rate in MISSING_COLS.items():
    col_idx = FIELDNAMES.index(col)
    for row in rows:
        if random.random() < rate:
            row[col] = ''

print(f"Writing CSV to {OUT_FILE} ...")
with open(OUT_FILE, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
    writer.writeheader()
    writer.writerows(rows)

pct_def = defaults / NUM_ROWS * 100
print(f"\nDone!")
print(f"Total rows      : {NUM_ROWS:,}")
print(f"Total columns   : {len(FIELDNAMES)}")
print(f"Defaults        : {defaults:,}  ({pct_def:.2f}%)")
print(f"Non-defaults    : {NUM_ROWS - defaults:,}  ({100-pct_def:.2f}%)")
print(f"Output file     : {OUT_FILE}")
