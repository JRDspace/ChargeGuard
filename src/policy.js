function nextPlugState(percent, current, low, high) {
  if (percent >= high) return false;
  if (percent <= low) return true;
  return false;
}

module.exports = { nextPlugState };
