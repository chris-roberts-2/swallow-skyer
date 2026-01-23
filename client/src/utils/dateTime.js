const toDate = value => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const formatLocalDateTime = (
  value,
  options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
) => {
  const date = toDate(value);
  if (!date) return value ? String(value) : '';
  return date.toLocaleString(undefined, options);
};

export const formatLocalDate = (
  value,
  options = { year: 'numeric', month: 'short', day: 'numeric' }
) => {
  const date = toDate(value);
  if (!date) return value ? String(value) : '';
  return date.toLocaleDateString(undefined, options);
};

export const formatLocalDateTimeParts = value => {
  const date = toDate(value);
  if (!date) return { dateLabel: value ? String(value) : '', timeLabel: '' };
  return {
    dateLabel: date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    timeLabel: date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
};
