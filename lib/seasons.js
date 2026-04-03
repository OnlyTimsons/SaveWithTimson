// Returns relevant seasonal and holiday keywords based on the current date
export function getSeasonalKeywords() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  const keywords = [];

  // Seasons
  if (month >= 2 && month <= 4) keywords.push('SPRING');
  if (month >= 5 && month <= 7) keywords.push('SUMMER');
  if (month >= 8 && month <= 10) keywords.push('FALL', 'AUTUMN');
  if (month === 11 || month <= 1) keywords.push('WINTER');

  // New Year: Dec 20 – Jan 5
  if ((month === 11 && day >= 20) || (month === 0 && day <= 5))
    keywords.push('NEWYEAR', 'NY');

  // Valentine: Feb 1-14
  if (month === 1 && day <= 14)
    keywords.push('VALENTINE', 'LOVE', 'VDAY');

  // Easter: March 15 – April 25 (wide window since date varies)
  if ((month === 2 && day >= 15) || (month === 3 && day <= 25))
    keywords.push('EASTER');

  // Mother's Day: April 25 – May 15
  if ((month === 3 && day >= 25) || (month === 4 && day <= 15))
    keywords.push('MOM', 'MOTHERS', 'MOTHERSDAY');

  // Father's Day: June 1-21
  if (month === 5 && day <= 21)
    keywords.push('DAD', 'FATHERS', 'FATHERSDAY');

  // 4th of July: June 25 – July 4
  if ((month === 5 && day >= 25) || (month === 6 && day <= 4))
    keywords.push('JULY4', 'INDEPENDENCE', 'FREEDOM');

  // Back to school: Aug 1 – Sep 15
  if ((month === 7) || (month === 8 && day <= 15))
    keywords.push('BTS', 'BACKTOSCHOOL', 'SCHOOL');

  // Halloween: Oct 15-31
  if (month === 9 && day >= 15)
    keywords.push('HALLOWEEN', 'SPOOKY');

  // Singles Day: Nov 1-11
  if (month === 10 && day <= 11)
    keywords.push('SINGLES');

  // Black Friday / Cyber Monday: Nov 15 – Dec 5
  if ((month === 10 && day >= 15) || (month === 11 && day <= 5))
    keywords.push('BLACKFRIDAY', 'BF', 'CYBERMONDAY', 'BFCM');

  // Christmas: Dec 1-25
  if (month === 11 && day <= 25)
    keywords.push('CHRISTMAS', 'XMAS', 'HOLIDAY');

  return keywords;
}
