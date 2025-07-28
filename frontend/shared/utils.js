export const formatCurrency = (amount) => {
  const numericAmount = Number(amount) || 0;
  const dollarsAmount = numericAmount / 100;
  return `$${dollarsAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatCurrencyButton = (cents) => {
  if (cents < 100) {
    return `${cents}¢`;
  }
  return `$${(cents / 100).toLocaleString()}`;
};
