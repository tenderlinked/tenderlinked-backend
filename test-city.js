function cleanCityName(location) {
  if (!location) return null;
  const invalidKeywords = ['hospital', 'school', 'college', 'office', 'dept', 'department', 'university', 'block', 'panchayat', 'municipality', 'division', 'zilla', 'parishad', 'sadan', 'institute', 'committee', 'health', 'center', 'centre', 'mission', 'corporation', 'project', 'police', 'station', 'authority', 'board', 'bhavan', 'bhawan', 'complex'];
  const locLower = location.toLowerCase();
  for (const keyword of invalidKeywords) {
    if (locLower.includes(keyword)) return null;
  }
  if (location.length > 25) return null;
  return location.replace(/[,-\/]/g, ' ').replace(/\s+/g, ' ').trim();
}
console.log(cleanCityName('Kakdwip Sub-divisional Hospital'));
console.log(cleanCityName('Baghajatin State General Hospital'));
console.log(cleanCityName('Chittaranjan Seva Sadan'));
console.log(cleanCityName('Nayagarh'));
console.log(cleanCityName('Purba Bardhaman'));
console.log(cleanCityName('Cuttack'));
