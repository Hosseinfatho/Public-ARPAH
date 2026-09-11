// ===== GLOBAL STATE =====
let currentPatient = null;
let patientData = null;
let questionData = null;

// Verify script is loaded
console.log('script.js loaded successfully');

// ===== GLOBAL FUNCTIONS (Define immediately for Chrome compatibility) =====
// These must be defined at the top level before any other code runs
// Chrome requires functions to be available when onclick handlers fire

function handleSelectPatient(patientNum) {
  console.log('handleSelectPatient called with:', patientNum);
  try {
    // Function declarations are hoisted, so showDashboard should be available
    showDashboard(patientNum);
  } catch (error) {
    console.error('Error in handleSelectPatient:', error);
    console.error('Error stack:', error.stack);
    alert('Error loading patient: ' + error.message);
  }
}

function handleBackToWelcome() {
  console.log('handleBackToWelcome called');
  try {
    showWelcomePage();
  } catch (error) {
    console.error('Error in handleBackToWelcome:', error);
  }
}

// Explicitly attach to window for Chrome compatibility
window.handleSelectPatient = handleSelectPatient;
window.handleBackToWelcome = handleBackToWelcome;

// ===== UTILITY FUNCTIONS =====

// Extract patient data from text file
// Supports both formats: combined "Age/Gender: 62-year-old male" or "Age/Gender: 62 Year Old / Male",
// and separate lines "Age: 62" / "Gender: Male"; and "Primary Diagnosis:" or "Most Responsible Diagnosis"
function extractPatientData(text) {
  const patientMatch = text.match(/Patient Name:\s*(.*)/i);
  // Allow optional spaces and line endings \r\n
  const ageGenderMatch = text.match(/Age\s*\/\s*Gender:\s*(.+?)(?:\r?\n|$)/im);
  const ageOnlyMatch = text.match(/^Age:\s*(.+?)(?:\r?\n|$)/im);
  const genderOnlyMatch = text.match(/^Gender:\s*(.+?)(?:\r?\n|$)/im);
  const admissionMatch = text.match(/Admission Date:\s*(\d+\/\d+(?:\/\d+)?)/i);
  const dischargeMatch = text.match(/Discharge Date:\s*(\d+\/\d+(?:\/\d+)?)/i);
  const dispositionMatch = text.match(/Discharge Disposition:\s*(.*?)(?=\s+Discipline:|\n\n|\nOverview:|\nPrimary Diagnosis)/is);
  const diagnosisMatch = text.match(/(?:Most Responsible Diagnosis|Primary Diagnosis):?\s*\n?(.*?)(?:\n\n|Discipline:|Hospital Course|Overview:)/is) ||
    text.match(/Primary Diagnosis:\s*(.*?)(?:\s+Discipline:|\n\n)/is);
  const disciplinesInvolvedMatch = text.match(/Disciplines Involved:\s*(.*?)(?:\n\n|\n[A-Z])/is);

  // ----- Age & Gender: "62-year-old male", "62 Year Old / Male", or separate "Age: 62" / "Gender: Male"
  let age = '';
  let gender = '';
  const ageGender = ageGenderMatch ? ageGenderMatch[1].trim() : '';
  if (ageGender) {
    // Age: match "62-year-old", "62 year old", "62 Year Old", or just first number
    const ageNum = ageGender.match(/(\d+)\s*(?:[-–—]?\s*year\s*[-–—]?\s*old|y\/o|yo\b)/i) || ageGender.match(/(\d+)/);
    if (ageNum) age = ageNum[1] + ' Year Old';
    // Gender: "male"/"female" (with or without slash before)
    const genderMatch = ageGender.match(/\/(\s*Male|\s*Female)\b/i) || ageGender.match(/\b(male|female)\b/i);
    if (genderMatch) {
      const g = (genderMatch[1] || genderMatch[2] || '').trim();
      gender = g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : '';
    }
  }
  if (!age && ageOnlyMatch) {
    const a = ageOnlyMatch[1].trim();
    const num = a.match(/(\d+)/);
    age = num ? num[1] + ' Year Old' : a;
  }
  if (!gender && genderOnlyMatch) {
    const g = genderOnlyMatch[1].trim();
    gender = g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : '';
  }

  // Normalize date to M/D for display (strip year if present)
  const normDate = (d) => d ? d.replace(/^(\d+\/\d+)(?:\/\d+)?/, '$1') : '';

  return {
    name: patientMatch ? patientMatch[1].trim() : '',
    age: age,
    gender: gender,
    ageGender: ageGender || [age, gender].filter(Boolean).join(', '),
    admitDate: normDate(admissionMatch ? admissionMatch[1] : ''),
    dischargeDate: normDate(dischargeMatch ? dischargeMatch[1] : ''),
    disposition: (dispositionMatch ? dispositionMatch[1] : (text.match(/Discharge Disposition:\s*(.*?)(?=\n\n|\n[A-Z])/is) || [])[1] || '').trim().replace(/\s+Discipline:.*$/i, '').trim(),
    diagnosis: diagnosisMatch ? diagnosisMatch[1].trim().split('\n')[0].trim().replace(/\s+Discipline:.*$/i, '').trim() : '',
    disciplinesInvolved: disciplinesInvolvedMatch ? disciplinesInvolvedMatch[1].trim() : ''
  };
}

// Extract readiness data from text - uses React logic, returns { category, Initial, Progress, Final }
function extractReadinessGrid(text) {
  // Extract dates
  const admissionMatch = text.match(/Admission Date:\s*(\d+\/\d+)/i);
  const dischargeMatch = text.match(/Discharge Date:\s*(\d+\/\d+)/i);
  
  if (!admissionMatch || !dischargeMatch) {
    // Fallback: return empty grid with categories
    const categories = ['Social Support', 'Education', 'Mobility', 'Wound Care', 'Swallowing', 'Medication', 'Caregiver', 'Follow-ups'];
    return categories.map(cat => ({ category: cat, Initial: 0, Progress: 0, Final: 0 }));
  }

  const admissionDate = admissionMatch[1];
  const dischargeDate = dischargeMatch[1];

  // Parse dates and generate date range (same logic as risk trend)
  const parseDate = (dateStr) => {
    const [month, day] = dateStr.split('/').map(Number);
    return { month, day };
  };

  const start = parseDate(admissionDate);
  const end = parseDate(dischargeDate);
  const dates = [];
  let currentMonth = start.month;
  let currentDay = start.day;
  
  const daysInMonth = (month) => {
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month - 1] || 31;
  };
  
  while (currentMonth < end.month || (currentMonth === end.month && currentDay <= end.day)) {
    dates.push(`${currentMonth}/${currentDay}`);
    currentDay++;
    if (currentDay > daysInMonth(currentMonth)) {
      currentMonth++;
      currentDay = 1;
    }
    if (currentMonth > 12 || (currentMonth > end.month && currentDay > end.day)) break;
  }

  const textLower = text.toLowerCase();
  const hospitalManagementMatch = text.match(/Hospital Management:?(.*?)(?:Discharge Plan|$)/is);
  const hospitalManagementText = hospitalManagementMatch ? hospitalManagementMatch[1].toLowerCase() : "";
  const dischargePlanMatch = text.match(/Discharge Plan:?(.*?)(?:Follow-Up|Education|Medications|$)/is);
  const dischargePlanText = dischargePlanMatch ? dischargePlanMatch[1].toLowerCase() : "";

  // Helper to get readiness level (0-3, increases over time)
  const getReadinessLevel = (domain, dayIndex, totalDays) => {
    let score = 0;
    const progress = dayIndex / Math.max(1, totalDays - 1); // 0 to 1
    
    const allText = textLower;
    const mgmtText = hospitalManagementText;
    const dcPlanText = dischargePlanText;
    
    // Simplified readiness calculation
    if (domain === "Mobility") {
      if (allText.includes('unsafe for ambulation') || allText.includes('2 person assist')) {
        score = progress < 0.3 ? 0 : progress < 0.6 ? 1 : 2;
      } else if (allText.includes('minimum assistance') || allText.includes('wheelchair')) {
        score = progress < 0.4 ? 1 : progress < 0.7 ? 2 : 2.5;
      } else {
        score = Math.min(3, Math.floor(progress * 2.5));
      }
    } else if (domain === "Education") {
      if (dcPlanText.includes('education') || allText.includes('education:')) {
        score = progress < 0.5 ? 0 : progress < 0.7 ? 1.5 : progress < 0.9 ? 2.5 : 3;
      } else {
        score = Math.min(3, Math.floor(progress * 2));
      }
    } else {
      // Default progression
      score = Math.min(3, Math.floor(progress * 2.5));
    }
    
    return Math.max(0, Math.min(3, Math.round(score)));
  };

  // Map domains to radar chart categories
  const domainMap = {
    'Social Support': 'SocialSupport',
    'Education': 'Education',
    'Mobility': 'Mobility',
    'Wound Care': 'WoundCare',
    'Swallowing': 'Swallowing',
    'Medication': 'MedicalStability', // Approximate
    'Caregiver': 'SocialSupport', // Approximate
    'Follow-ups': 'Education' // Approximate
  };
  
  const categories = ['Social Support', 'Education', 'Mobility', 'Wound Care', 'Swallowing', 'Medication', 'Caregiver', 'Follow-ups'];
  const grid = [];
  
  categories.forEach(cat => {
    const domain = domainMap[cat] || 'Mobility';
    const totalDays = dates.length;
    const third = Math.floor(totalDays / 3);
    
    // Get scores at Initial (first third), Progress (middle), Final (last third)
    const initialIdx = Math.max(0, Math.floor(totalDays * 0.1));
    const progressIdx = Math.max(0, Math.floor(totalDays * 0.5));
    const finalIdx = Math.max(0, totalDays - 1);
    
    const Initial = getReadinessLevel(domain, initialIdx, totalDays);
    const Progress = getReadinessLevel(domain, progressIdx, totalDays);
    const Final = getReadinessLevel(domain, finalIdx, totalDays);
    
    grid.push({ category: cat, Initial, Progress, Final });
  });
  
  return grid;
}

// Extract risk trend data - uses full React logic, returns { dayNumber, riskScore }
function extractRiskTrendData(text) {
  // Extract dates
  const admissionMatch = text.match(/Admission Date:\s*(\d+\/\d+)/i);
  const dischargeMatch = text.match(/Discharge Date:\s*(\d+\/\d+)/i);
  
  if (!admissionMatch || !dischargeMatch) {
    return [];
  }

  const admissionDate = admissionMatch[1];
  const dischargeDate = dischargeMatch[1];

  // Parse dates (format: M/D)
  const parseDate = (dateStr) => {
    const [month, day] = dateStr.split('/').map(Number);
    return { month, day };
  };

  const start = parseDate(admissionDate);
  const end = parseDate(dischargeDate);

  // Generate date range
  const dates = [];
  let currentMonth = start.month;
  let currentDay = start.day;
  
  const daysInMonth = (month) => {
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month - 1] || 31;
  };
  
  while (currentMonth < end.month || (currentMonth === end.month && currentDay <= end.day)) {
    dates.push(`${currentMonth}/${currentDay}`);
    currentDay++;
    
    if (currentDay > daysInMonth(currentMonth)) {
      currentMonth++;
      currentDay = 1;
    }
    
    if (currentMonth > 12 || (currentMonth > end.month && currentDay > end.day)) {
      break;
    }
  }

  // Analyze patient data for risk assessment
  const textLower = text.toLowerCase();
  const hospitalManagementMatch = text.match(/Hospital Management:?(.*?)(?:Discharge Plan|$)/is);
  const hospitalManagementText = hospitalManagementMatch ? hospitalManagementMatch[1].toLowerCase() : "";
  const dischargePlanMatch = text.match(/Discharge Plan:?(.*?)(?:Follow-Up|Education|Medications|$)/is);
  const dischargePlanText = dischargePlanMatch ? dischargePlanMatch[1].toLowerCase() : "";
  const hospitalCourseMatch = text.match(/Hospital Course:?(.*?)(?:Prior level|Self-care|$)/is);
  const hospitalCourseText = hospitalCourseMatch ? hospitalCourseMatch[1].toLowerCase() : "";

  // Helper to determine risk level for a domain
  const getRiskLevel = (domain, dayIndex, totalDays) => {
    let riskScore = 3;
    const progress = (totalDays - 1 - dayIndex) / Math.max(1, totalDays - 1);
    const isNearDischarge = progress < 0.15;
    const isDischargeDay = dayIndex === totalDays - 1;
    
    const allText = textLower;
    const mgmtText = hospitalManagementText;
    const dcPlanText = dischargePlanText;
    const courseText = hospitalCourseText;
    
    // Simplified risk calculation - aggregate key indicators
    if (domain === "Mobility") {
      if (allText.includes('unsafe for ambulation') || allText.includes('2 person assist')) {
        riskScore = isDischargeDay ? 0 : (progress > 0.7 ? 3 : progress > 0.4 ? 2 : 1.5);
      } else if (allText.includes('minimum assistance') || allText.includes('wheelchair')) {
        riskScore = isDischargeDay ? 0 : (progress > 0.5 ? 2 : 1.5);
      } else {
        riskScore = isDischargeDay ? 0 : Math.max(0, progress * 2);
      }
    } else if (domain === "MedicalStability") {
      if (courseText.includes('electrolyte') || allText.includes('respiratory failure') || allText.includes('icu')) {
        riskScore = isDischargeDay ? 0 : (progress > 0.7 ? 3 : progress > 0.4 ? 2 : 1.5);
      } else {
        riskScore = isDischargeDay ? 0 : Math.max(0, progress * 2);
      }
    } else {
      // Default for other domains
      riskScore = isDischargeDay ? 0 : Math.max(0, progress * 2);
    }
    
    return Math.max(0, Math.min(3, Math.round(riskScore * 10) / 10));
  };

  // Aggregate risk across key domains
  const domains = ["Mobility", "MedicalStability", "Swallowing", "SocialSupport"];
  
  const riskData = dates.map((date, index) => {
    // Calculate average risk across domains
    const domainRisks = domains.map(d => getRiskLevel(d, index, dates.length));
    const avgRisk = domainRisks.reduce((a, b) => a + b, 0) / domainRisks.length;
    
    return {
      dayNumber: index + 1,
      riskScore: Math.max(0, Math.min(3, Math.round(avgRisk * 10) / 10))
    };
  });
  
  return riskData;
}

// Extract timeline sections with content (for modal display)
// Categorizes events based on section markers in chronological order:
// - After "Diagnosis", "Overview" → "ER" stage
// - After "Overview" and before "Hospital Management" → "Home" stage
// - From "Hospital Management" and before "Discharge Plan" → "Unit" stage
// - From "Discharge Plan" till "Plan for follow-up" → "Discharge" phase
// - After "Plan for follow-up" → "Post-Discharge" stage
function extractTimelineSections(text) {
  const phases = [
    {
      key: "patient_info",
      label: "Patient_info",
      order: -1
    },
    {
      key: "er",
      label: "ER",
      order: 0
    },
    {
      key: "home",
      label: "Home",
      order: 1
    },
    {
      key: "unit",
      label: "Unit",
      order: 2
    },
    {
      key: "discharge",
      label: "Discharge",
      order: 3
    },
    {
      key: "back_home",
      label: "Back_Home",
      order: 4
    }
  ];
  
  const lines = String(text)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  
  // Track current phase based on section markers
  let currentPhase = "patient_info";
  let foundDiagnosis = false;
  let foundOverview = false;
  let foundHospitalManagement = false;
  let foundDischargePlan = false;
  let foundPlanForFollowUp = false;
  
  const rows = [];
  const headersNoColon = [/^Most Responsible Diagnosis$/i, /^Primary Diagnosis$/i];
  const attachToPrev = [/^Consult to Social work/i];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Determine current phase based on section markers
    // Check in order of priority
    
    // Hospital Management marker - everything from here (until Discharge Plan) is "Unit"
    if (/^Hospital Management:?/i.test(line)) {
      foundHospitalManagement = true;
      currentPhase = "unit";
    }
    // Discharge Plan marker - everything from here (until Plan for follow-up) is "Discharge"
    else if (/^Discharge Plan:?/i.test(line)) {
      foundDischargePlan = true;
      currentPhase = "discharge";
    }
    // Plan for follow-up marker - everything after this is "Post-Discharge"
    else if (/^Plan for follow-?up:?/i.test(line)) {
      foundPlanForFollowUp = true;
      currentPhase = "back_home";
    }
    // Overview marker - goes to ER phase
    else if (/^Overview:?/i.test(line)) {
      foundOverview = true;
      currentPhase = "er"; // Overview goes to ER phase
    }
    // After Overview and before Hospital Management → Home phase
    else if (foundOverview && !foundHospitalManagement) {
      currentPhase = "home";
    }
    // Diagnosis marker - after this, everything goes to Home (until Overview, then ER, then Home again)
    else if (/^(Primary Diagnosis|Most Responsible Diagnosis):?/i.test(line)) {
      foundDiagnosis = true;
      // Don't set phase yet - will be set when we see Overview or next line
    }
    // If we found Diagnosis but not Overview yet, also Home phase
    else if (foundDiagnosis && !foundOverview && !foundHospitalManagement) {
      currentPhase = "home";
    }
    
    // Skip patient info lines (they don't count as events)
    if (/^(Patient Name|Age\/?Gender|Admission Date|Discharge Date|Discharge Disposition|Disciplines Involved):?/i.test(line)) {
      continue;
    }
    
    // Skip section separators - these are just markers, not events
    // Skip "Hospital Management", "Discharge Plan", or "Plan for follow-up" lines (with or without colon, with or without content)
    if (/^Hospital Management:?/i.test(line.trim()) || 
        /^Discharge Plan:?/i.test(line.trim()) || 
        /^Plan for follow-?up:?/i.test(line.trim())) {
      continue;
    }
    
    // Skip empty lines
    if (!line || line.length === 0) {
      continue;
    }
    
    // Handle headers without colons (like "Most Responsible Diagnosis" as a standalone header)
    if (headersNoColon.some((re) => re.test(line))) {
      const next = (lines[i + 1] || "").replace(/^[–—-]\s*/, "").trim();
      rows.push({
        id: `sec_${rows.length + 1}`,
        phase: currentPhase,
        label: line.trim(),
        content: next
      });
      i++; // Skip the next line as it's the content
      continue;
    }
    
    // Handle lines that attach to previous
    if (attachToPrev.some((re) => re.test(line)) && rows.length) {
      rows[rows.length - 1].content += " " + line.trim();
      continue;
    }
    
    // Special handling for Unit stage: group events by Discipline markers
    if (currentPhase === "unit") {
      // Check if this line ends with "Discipline:" or is a standalone "Discipline:" line
      const hasDisciplineAtEnd = /\s+Discipline:\s*[A-Za-z,\s]+$/i.test(line);
      const isStandaloneDiscipline = /^Discipline:\s*/i.test(line);
      
      if (isStandaloneDiscipline) {
        // Standalone Discipline line - finalize current event if exists
        const disciplineMatch = line.match(/^Discipline:\s*(.+)$/i);
        if (disciplineMatch && rows.length > 0 && rows[rows.length - 1].phase === "unit") {
          const discipline = disciplineMatch[1].trim();
          // Append discipline to the previous row's content
          if (rows[rows.length - 1].content) {
            rows[rows.length - 1].content += " Discipline: " + discipline;
          } else {
            rows[rows.length - 1].content = "Discipline: " + discipline;
          }
        }
        continue;
      }
      
      // If line ends with Discipline, finalize current event and start new one
      if (hasDisciplineAtEnd) {
        // Extract discipline from the end
        const disciplineMatch = line.match(/\s+Discipline:\s*([A-Za-z,\s]+)$/i);
        const discipline = disciplineMatch ? disciplineMatch[1].trim() : null;
        
        // Remove discipline from line content
        const lineWithoutDiscipline = line.replace(/\s+Discipline:\s*[A-Za-z,\s]+$/i, '').trim();
        
        // Parse the line content
        const m = lineWithoutDiscipline.match(/^([^:]+):\s*(.*)$/);
        if (m) {
          let label = m[1].trim();
          let content = m[2].trim();
          
          // If there's existing content in current event, append to it
          if (rows.length > 0 && rows[rows.length - 1].phase === "unit" && 
              !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
            // Append to existing event with newline separator
            if (label) {
              rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + label + (content ? ": " + content : "");
            } else {
              rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + content;
            }
          } else {
            // Create new event
            rows.push({
              id: `sec_${rows.length + 1}`,
              phase: currentPhase,
              label: label || "",
              content: content
            });
          }
          
          // Add discipline to the finalized event
          if (discipline && rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            if (lastRow.content) {
              lastRow.content += "\nDiscipline: " + discipline;
            } else {
              lastRow.content = "Discipline: " + discipline;
            }
          }
        } else {
          // Line without colon format - append to current event or create new
          if (rows.length > 0 && rows[rows.length - 1].phase === "unit" && 
              !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
            rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + lineWithoutDiscipline;
            if (discipline) {
              rows[rows.length - 1].content += " Discipline: " + discipline;
            }
          } else {
            rows.push({
              id: `sec_${rows.length + 1}`,
              phase: currentPhase,
              label: "",
              content: lineWithoutDiscipline + (discipline ? " Discipline: " + discipline : "")
            });
          }
        }
        continue;
      }
      
      // For Unit stage, accumulate content until we hit a Discipline marker
      // Parse regular lines with format "Label: Content"
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m) {
        let label = m[1].trim();
        let content = m[2].trim();
        
        // If there's an existing event without discipline, append to it
        if (rows.length > 0 && rows[rows.length - 1].phase === "unit" && 
            !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
          // Append to existing event with newline separator for better parsing
          if (label) {
            rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + label + (content ? ": " + content : "");
          } else {
            rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + content;
          }
        } else {
          // Start new event
          rows.push({
            id: `sec_${rows.length + 1}`,
            phase: currentPhase,
            label: label,
            content: content
          });
        }
      } else {
        // Lines without colons - append to current event or create new
        if (rows.length > 0 && rows[rows.length - 1].phase === "unit" && 
            !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
          rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + line.trim();
        } else {
          rows.push({
            id: `sec_${rows.length + 1}`,
            phase: currentPhase,
            label: line.trim(),
            content: ""
          });
        }
      }
      continue;
    }
    
    // Special handling for Discharge stage: group events by Discipline markers (same as Unit)
    if (currentPhase === "discharge") {
      // Check if this line ends with "Discipline:" or is a standalone "Discipline:" line
      const hasDisciplineAtEnd = /\s+Discipline:\s*[A-Za-z,\s]+$/i.test(line);
      const isStandaloneDiscipline = /^Discipline:\s*/i.test(line);
      
      if (isStandaloneDiscipline) {
        // Standalone Discipline line - finalize current event if exists
        const disciplineMatch = line.match(/^Discipline:\s*(.+)$/i);
        if (disciplineMatch && rows.length > 0 && rows[rows.length - 1].phase === "discharge") {
          const discipline = disciplineMatch[1].trim();
          // Append discipline to the previous row's content
          if (rows[rows.length - 1].content) {
            rows[rows.length - 1].content += " Discipline: " + discipline;
          } else {
            rows[rows.length - 1].content = "Discipline: " + discipline;
          }
        }
        continue;
      }
      
      // If line ends with Discipline, finalize current event and start new one
      if (hasDisciplineAtEnd) {
        // Extract discipline from the end
        const disciplineMatch = line.match(/\s+Discipline:\s*([A-Za-z,\s]+)$/i);
        const discipline = disciplineMatch ? disciplineMatch[1].trim() : null;
        
        // Remove discipline from line content
        const lineWithoutDiscipline = line.replace(/\s+Discipline:\s*[A-Za-z,\s]+$/i, '').trim();
        
        // Parse the line content
        const m = lineWithoutDiscipline.match(/^([^:]+):\s*(.*)$/);
        if (m) {
          let label = m[1].trim();
          let content = m[2].trim();
          
          // If there's existing content in current event, append to it
          if (rows.length > 0 && rows[rows.length - 1].phase === "discharge" && 
              !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
            // Append to existing event with newline separator
            if (label) {
              rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + label + (content ? ": " + content : "");
            } else {
              rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + content;
            }
          } else {
            // Create new event
            rows.push({
              id: `sec_${rows.length + 1}`,
              phase: currentPhase,
              label: label || "",
              content: content
            });
          }
          
          // Add discipline to the finalized event
          if (discipline && rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            if (lastRow.content) {
              lastRow.content += "\nDiscipline: " + discipline;
            } else {
              lastRow.content = "Discipline: " + discipline;
            }
          }
        } else {
          // Line without colon format - append to current event or create new
          if (rows.length > 0 && rows[rows.length - 1].phase === "discharge" && 
              !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
            rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + lineWithoutDiscipline;
            if (discipline) {
              rows[rows.length - 1].content += " Discipline: " + discipline;
            }
          } else {
            rows.push({
              id: `sec_${rows.length + 1}`,
              phase: currentPhase,
              label: "",
              content: lineWithoutDiscipline + (discipline ? " Discipline: " + discipline : "")
            });
          }
        }
        continue;
      }
      
      // For Discharge stage, accumulate content until we hit a Discipline marker
      // Parse regular lines with format "Label: Content"
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m) {
        let label = m[1].trim();
        let content = m[2].trim();
        
        // If there's an existing event without discipline, append to it
        if (rows.length > 0 && rows[rows.length - 1].phase === "discharge" && 
            !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
          // Append to existing event with newline separator
          if (label) {
            rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + label + (content ? ": " + content : "");
          } else {
            rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + content;
          }
        } else {
          // Start new event
          rows.push({
            id: `sec_${rows.length + 1}`,
            phase: currentPhase,
            label: label,
            content: content
          });
        }
      } else {
        // Lines without colons - append to current event or create new
        if (rows.length > 0 && rows[rows.length - 1].phase === "discharge" && 
            !rows[rows.length - 1].content.match(/Discipline:\s*[A-Za-z,\s]+$/i)) {
          rows[rows.length - 1].content += (rows[rows.length - 1].content ? "\n" : "") + line.trim();
        } else {
          rows.push({
            id: `sec_${rows.length + 1}`,
            phase: currentPhase,
            label: line.trim(),
            content: ""
          });
        }
      }
      continue;
    }
    
    // Parse regular lines with format "Label: Content" (for non-Unit, non-Discharge phases)
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) {
      let label = m[1].trim();
      let content = m[2].trim();
      
      rows.push({
        id: `sec_${rows.length + 1}`,
        phase: currentPhase,
        label: label,
        content: content
      });
    } else {
      // Lines without colons - treat as content continuation or standalone
      // If previous row exists and is in same phase, append to it
      if (rows.length > 0 && rows[rows.length - 1].phase === currentPhase) {
        rows[rows.length - 1].content += " " + line.trim();
      } else {
        // Standalone line - create new row
        rows.push({
          id: `sec_${rows.length + 1}`,
          phase: currentPhase,
          label: line.trim(),
          content: ""
        });
      }
    }
  }
  
  // Group by phase and merge
  const byPhase = {};
  rows.forEach(row => {
    if (!byPhase[row.phase]) byPhase[row.phase] = [];
    byPhase[row.phase].push(row);
  });
  
  const merged = [];
  phases.forEach(p => {
    const items = byPhase[p.key] || [];
    if (!items.length && p.key !== "patient_info") return;
    
    let count = items.length;
    if (p.key === "patient_info") count = 0;
    
    merged.push({
      id: `merged_${p.key}`,
      phase: p.key,
      label: p.label,
      content: items.map((d) => {
        if (d.content) {
          return `• ${d.label}: ${d.content}`;
        } else {
          return `• ${d.label}`;
        }
      }).join("\n"),
      count: count
    });
  });
  
  return merged;
}

// Extract event timeline data - counts events by phase
// Uses section-based categorization: ER, Home, Unit, Discharge, Post-Discharge
function extractEventTimeline(text, sections) {
  const phaseLabels = {
    er: 'ER',
    home: 'Home',
    unit: 'Unit',
    discharge: 'Discharge',
    back_home: 'Post-Discharge'
  };
  
  // Use sections if available (preferred method)
  if (sections && sections.length > 0) {
    const phaseData = {};
    sections.forEach(s => {
      // Skip patient_info phase
      if (s.phase === 'patient_info') return;
      
      if (!phaseData[s.phase]) {
        phaseData[s.phase] = { count: 0, sections: [] };
      }
      // Calculate count from sections - use the count property which represents number of items
      let sectionCount = s.count ?? 0;
      // Fallback: if count is 0 but content exists, count the bullet points
      if (sectionCount === 0 && s.content) {
        const contentLines = s.content.split('\n').filter(l => l.trim().startsWith('•'));
        sectionCount = contentLines.length;
      }
      phaseData[s.phase].count += sectionCount;
      phaseData[s.phase].sections.push(s);
    });
    
    const phaseOrder = ['home', 'er', 'unit', 'discharge', 'back_home'];
    const events = [];
    phaseOrder.forEach((phaseKey) => {
      if (phaseData[phaseKey] && phaseData[phaseKey].count > 0) {
        events.push({
          phase: phaseKey,
          label: phaseLabels[phaseKey] || phaseKey,
          count: phaseData[phaseKey].count,
          sections: phaseData[phaseKey].sections
        });
      }
    });
    
    return events;
  }
  
  // Fallback: simple counting based on section markers
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const phaseCounts = {
    er: 0,
    home: 0,
    unit: 0,
    discharge: 0,
    back_home: 0
  };
  
  let currentPhase = 'home'; // Start with home after diagnosis
  let foundDiagnosis = false;
  let foundOverview = false;
  
  lines.forEach(line => {
    // Check for section markers
    if (/^(Primary Diagnosis|Most Responsible Diagnosis):?/i.test(line)) {
      foundDiagnosis = true;
      currentPhase = 'home';
    } else if (/^Overview:?/i.test(line)) {
      foundOverview = true;
      currentPhase = 'er';
      phaseCounts['er']++;
    } else if (foundOverview && !/^Hospital Management:?/i.test(line)) {
      currentPhase = 'home';
    } else if (/^Hospital Management:?/i.test(line)) {
      currentPhase = 'unit';
      phaseCounts['unit']++;
    } else if (/^Discharge Plan:?/i.test(line)) {
      currentPhase = 'discharge';
      phaseCounts['discharge']++;
    } else if (/^Plan for follow-?up:?/i.test(line)) {
      currentPhase = 'back_home';
      phaseCounts['back_home']++;
    } else if (foundDiagnosis && currentPhase && !/^(Patient Name|Age\/?Gender|Admission Date|Discharge Date|Discharge Disposition):?/i.test(line)) {
      // Count non-empty lines in current phase
      if (line.length > 0 && /^[^:]+:\s*/.test(line)) {
        phaseCounts[currentPhase]++;
      }
    }
  });
  
  const events = [];
  const phaseOrder = ['home', 'er', 'unit', 'discharge', 'back_home'];
  phaseOrder.forEach(phaseKey => {
    if (phaseCounts[phaseKey] > 0) {
      events.push({
        phase: phaseKey,
        label: phaseLabels[phaseKey] || phaseKey,
        count: phaseCounts[phaseKey],
        sections: []
      });
    }
  });
  
  return events;
}

// Extract logistics data - uses React extract.js logic
function extractLogisticsData(text) {
  // Education
  const eduMatch = text.match(/Education:(.*?)(Follow-Up|$)/is);
  let educationList = [];
  if (eduMatch) {
    educationList = eduMatch[1]
      .split(/[,.\n]/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }
  const educationCompleted = educationList.length > 0 ? Math.floor(educationList.length * 0.7) : 0;
  const educationProgress = educationList.length > 0 ? educationCompleted / educationList.length : 0.67;
  
  // Medications
  const medsMatch = text.match(/Medications:(.*)/is);
  let meds = [];
  if (medsMatch) {
    meds = medsMatch[1]
      .split(/[,.\n]/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
  }
  const medActive = meds.filter(m => !m.toLowerCase().includes('during stay')).length;
  const medicationProgress = meds.length > 0 ? medActive / meds.length : 0.9;
  
  // Caregiver
  const caregiverMatch = text.match(/Self-care\/Caregiving:(.*?)(Hospital|$)/is);
  let caregiverProgress = 0.6;
  if (caregiverMatch) {
    const caregiverText = caregiverMatch[1].toLowerCase();
    if (caregiverText.includes('24/7')) {
      caregiverProgress = 1.0;
    } else if (caregiverText.includes('checks in frequently')) {
      caregiverProgress = 0.75;
    } else if (caregiverText.includes('caregiver')) {
      caregiverProgress = 0.6;
    }
  }
  
  // Follow-ups
  const followUpMatch = text.match(/Follow-Up Arrangements(.*?)Medications:/is);
  let followUps = [];
  if (followUpMatch) {
    followUps = followUpMatch[1]
      .split(/[,.\n]/)
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .map((f) => ({
        name: f,
        completed: f.toLowerCase().includes('arranged') || f.toLowerCase().includes('clinic')
      }));
  }
  const followUpsCompleted = followUps.filter(f => f.completed).length;
  const followUpsProgress = followUps.length > 0 ? followUpsCompleted / followUps.length : 0.85;
  
  return [
    { title: 'Education', progress: Math.min(1, educationProgress), color: '#2563EB' },
    { title: 'Medication', progress: Math.min(1, medicationProgress), color: '#8B5CF6' },
    { title: 'Caregiver', progress: Math.min(1, caregiverProgress), color: '#EC4899' },
    { title: 'Follow-ups', progress: Math.min(1, followUpsProgress), color: '#F59E0B' }
  ];
}

// ===== LOAD PATIENT DATA =====
// Modal state
let isModalOpen = false;
let selectedPhase = null;

// Create and show modal
function showTimelineModal(phaseKey, phaseSections) {
  if (!phaseSections || phaseSections.length === 0) {
    alert('No events found for this phase.');
    return;
  }
  
  selectedPhase = {
    key: phaseKey,
    label: phaseSections[0]?.label || phaseKey,
    sections: phaseSections
  };
  
  // Parse content to bullets with proper sub-bullet formatting
  const parseContentToBullets = (content) => {
    if (!content) return [];
    
    let items = [];
    
    // Split by newlines - each line is a separate item
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return [];
    
    // Special handling for Home stage - parse into bullet points
    if (selectedPhase.key === 'home') {
      lines.forEach(line => {
        const cleanLine = line.replace(/^•\s*/, '').trim();
        if (!cleanLine) return;
        
        // Try to parse as "Label: Content" format
        const match = cleanLine.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          const label = match[1].trim();
          let text = match[2].trim();
          
          // Extract discipline if present
          let discipline = null;
          const disciplineMatch = text.match(/\s+Discipline:\s*([A-Za-z.,\s]+)$/i);
          if (disciplineMatch) {
            discipline = disciplineMatch[1].trim();
            text = text.replace(/\s+Discipline:\s*[A-Za-z.,\s]+$/i, '').trim();
          }
          
          // Add main item
          const mainItem = {
            label: label,
            text: '',
            isSubItem: false,
            discipline: null,
            subItems: []
          };
          
          // Parse sub-items based on label type
          if (label.includes('Relevant Medical History')) {
            // Split by commas for medical history items
            // The text format is: "Item1, Item2, Item3, Item4 Discipline: ..."
            // First, extract discipline if present
            let textToParse = text;
            if (discipline) {
              // Discipline already extracted, remove it from text
              textToParse = text.replace(/\s+Discipline:.*$/i, '').trim();
            }
            
            // Split by commas
            const parts = textToParse.split(',').map(p => p.trim()).filter(p => p.length > 0);
            parts.forEach(part => {
              mainItem.subItems.push({ text: part, isSubItem: true });
            });
            
            // Add discipline as separate bullet if present
            if (discipline) {
              mainItem.subItems.push({ text: `Discipline: ${discipline}`, isSubItem: true });
            }
          } else if (label.includes('Home Setup') || label.includes('PLOF')) {
            // Split the text into logical bullet points based on sentence structure
            // First, extract discipline if present
            let textToParse = text;
            if (discipline) {
              // Discipline already extracted, remove it from text
              textToParse = text.replace(/\s+Discipline:.*$/i, '').trim();
            }
            
            // Split by periods (sentences)
            const sentences = textToParse.split(/\.\s+/).map(s => s.trim()).filter(s => s.length > 0);
            
            sentences.forEach(sentence => {
              // Clean up the sentence (remove trailing period if any)
              const cleanSentence = sentence.replace(/\.$/, '').trim();
              if (cleanSentence.length > 0) {
                mainItem.subItems.push({ text: cleanSentence, isSubItem: true });
              }
            });
            
            // Add discipline as separate bullet if present
            if (discipline) {
              mainItem.subItems.push({ text: `Discipline: ${discipline}`, isSubItem: true });
            }
          } else {
            // For other labels, just add the text as a single item
            if (text) {
              mainItem.subItems.push({ text: text, isSubItem: true });
            }
            // Add discipline as separate bullet if present (for other labels)
            if (discipline) {
              mainItem.subItems.push({ text: `Discipline: ${discipline}`, isSubItem: true });
            }
          }
          
          items.push(mainItem);
        } else {
          // No label - just text
          items.push({ 
            text: cleanLine, 
            isSubItem: false,
            discipline: null
          });
        }
      });
    } else {
      // For other stages (ER, Unit, Discharge, Post-Discharge) - use same bullet format as Home
      let currentMainItem = null;
      
      // Use for loop to enable look-ahead
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cleanLine = line.replace(/^•\s*/, '').trim();
        if (!cleanLine) continue;
        
        // Try to parse as "Label: Content" format
        const match = cleanLine.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const label = match[1].trim();
          let text = match[2].trim();
          
          // Check if this is a Discipline line - add to current main item's subItems
          // Fix: label is "Discipline" (without colon), so use case-insensitive comparison
          if (label.toLowerCase() === 'discipline') {
            if (currentMainItem && currentMainItem.subItems) {
              currentMainItem.subItems.push({ text: `Discipline: ${text}`, isSubItem: true });
            }
            // Don't create a new main item for Discipline - it should be part of previous event
          } else {
            // This is a main item - create new main item with subItems array
            currentMainItem = {
              label: label,
              text: '',
              isSubItem: false,
              discipline: null,
              subItems: []
            };
            
            // Check if text contains "Discipline:" at the end and extract it
            if (text) {
              const disciplineMatch = text.match(/\s+Discipline:\s*([A-Za-z,.\s]+)$/i);
              if (disciplineMatch) {
                // Extract the main content (without Discipline)
                const mainContent = text.substring(0, disciplineMatch.index).trim();
                const disciplineValue = disciplineMatch[1].trim();
                
                // Add main content as sub-item if it exists
                if (mainContent) {
                  currentMainItem.subItems.push({ text: mainContent, isSubItem: true });
                }
                
                // Add Discipline as the last sub-item in this section
                currentMainItem.subItems.push({ text: `Discipline: ${disciplineValue}`, isSubItem: true });
              } else {
                // No Discipline in text, add as regular sub-item
                currentMainItem.subItems.push({ text: text, isSubItem: true });
              }
            }
            
            items.push(currentMainItem);
          }
        } else {
          // Check if line ends with colon (label with no content)
          if (cleanLine.endsWith(':')) {
            // This is a label with no content - create new main item
            currentMainItem = {
              label: cleanLine.replace(':', '').trim(),
              text: '',
              isSubItem: false,
              discipline: null,
              subItems: []
            };
            items.push(currentMainItem);
          } else {
            // Check if this line contains "Discipline:" at the end
            const disciplineMatch = cleanLine.match(/\s+Discipline:\s*([A-Za-z,.\s]+)$/i);
            if (disciplineMatch && currentMainItem) {
              // Extract the main content (without Discipline)
              const mainContent = cleanLine.substring(0, disciplineMatch.index).trim();
              const disciplineValue = disciplineMatch[1].trim();
              
              // Add main content as sub-item if it exists
              if (mainContent) {
                currentMainItem.subItems.push({ text: mainContent, isSubItem: true });
              }
              
              // Add Discipline as the last sub-item in this section
              currentMainItem.subItems.push({ text: `Discipline: ${disciplineValue}`, isSubItem: true });
            } else {
              // Check if this line is a section header (no colon, but followed by lines with colons)
              // Look ahead to see if the next line has a colon
              const nextLine = i < lines.length - 1 
                ? lines[i + 1].replace(/^•\s*/, '').trim() 
                : null;
              
              // If next line has a colon, this is likely a section header (new main item)
              // Also check if line starts with capital letter and doesn't end with period (section header pattern)
              const isLikelySectionHeader = nextLine && /^[^:]+:\s*/.test(nextLine) && 
                /^[A-Z]/.test(cleanLine) && !cleanLine.endsWith('.') && !cleanLine.match(/^[•●○◦▪▸►-]/);
              
              if (isLikelySectionHeader) {
                // This is a section header - create new main item
                currentMainItem = {
                  label: cleanLine,
                  text: '',
                  isSubItem: false,
                  discipline: null,
                  subItems: []
                };
                items.push(currentMainItem);
              } else {
                // No label - this is a sub-item, add to current main item or create new
                if (currentMainItem) {
                  currentMainItem.subItems.push({ text: cleanLine, isSubItem: true });
                } else {
                  // No main item yet, create one with this as sub-item
                  currentMainItem = {
                    label: '',
                    text: '',
                    isSubItem: false,
                    discipline: null,
                    subItems: [{ text: cleanLine, isSubItem: true }]
                  };
                  items.push(currentMainItem);
                }
              }
            }
          }
        }
      }
    }
    
    return items.filter(item => (item.text !== undefined && item.text !== null && item.text.length > 0) || item.label || (item.subItems && item.subItems.length > 0));
  };
  
  // Process each section separately to maintain event grouping
  const processedSections = selectedPhase.sections.map(section => {
    const bullets = parseContentToBullets(section.content);
    return { section, bullets };
  });
  
  const phaseIcons = {
    er: "🚑",
    home: "🏠",
    unit: "🏥",
    discharge: "📋",
    back_home: "🏡"
  };
  
  const phaseIcon = phaseIcons[selectedPhase.key] || "📄";
  
  // Create modal HTML
  const modalHTML = `
    <div class="common-modal-overlay" id="timeline-modal-overlay">
      <div class="common-modal-content" id="timeline-modal-content">
        <h3 class="common-modal-title">
          <span>${phaseIcon}</span>
          <span>${selectedPhase.label}</span>
        </h3>
        ${processedSections.length > 0 ? `
          <div class="timeline-modal-events">
            ${processedSections.map(({ section, bullets }, sectionIndex) => `
              <div class="timeline-event-group" data-section-index="${sectionIndex}">
                ${bullets.length > 0 ? `
                  <ul class="common-modal-list timeline-event-list">
                    ${bullets.map((item, itemIndex) => {
                      // All stages now use the same format with sub-items
                      if (item.subItems && item.subItems.length > 0) {
                        return `
                        <li class="common-modal-list-item timeline-main-item">
                          <div class="timeline-item-content">
                            ${item.label ? `<strong class="common-modal-label timeline-item-label">${item.label}:</strong>` : ''}
                          </div>
                          <ul class="timeline-sub-list">
                            ${item.subItems.map(subItem => {
                              // Strip any existing bullet characters from the text
                              const cleanText = subItem.text.replace(/^[•●○◦▪▸►-]\s*/g, '').trim();
                              return `<li class="timeline-sub-bullet">• ${cleanText}</li>`;
                            }).join('')}
                          </ul>
                        </li>
                        `;
                      }
                      
                      // Fallback for items without subItems (shouldn't happen with new logic, but keep for safety)
                      const bulletPrefix = item.isSubItem ? '• ' : '';
                      const disciplineText = item.discipline ? ` <span class="timeline-discipline">Discipline: ${item.discipline}</span>` : '';
                      
                      return `
                      <li class="common-modal-list-item ${item.isSubItem ? 'timeline-sub-item' : 'timeline-main-item'}">
                        ${item.label ? `
                          <div class="timeline-item-content">
                            ${bulletPrefix}<strong class="common-modal-label timeline-item-label">${item.label}:</strong>
                            <span class="timeline-item-text">${item.text}${disciplineText}</span>
                          </div>
                        ` : `
                          <div class="timeline-item-content">
                            ${bulletPrefix}<span class="timeline-item-text">${item.text}${disciplineText}</span>
                          </div>
                        `}
                      </li>
                    `;
                    }).join('')}
                  </ul>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : '<div class="common-modal-empty">No events found for this phase.</div>'}
        <div class="common-modal-close-container">
          <button class="common-modal-close-button" id="timeline-modal-close">Close</button>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if any
  const existingModal = document.getElementById('timeline-modal-overlay');
  if (existingModal) existingModal.remove();
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  isModalOpen = true;
  
  // Add event listeners
  const overlay = document.getElementById('timeline-modal-overlay');
  const closeBtn = document.getElementById('timeline-modal-close');
  const content = document.getElementById('timeline-modal-content');
  
  const closeModal = () => {
    if (overlay) overlay.remove();
    isModalOpen = false;
    selectedPhase = null;
  };
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  
  closeBtn.addEventListener('click', closeModal);
  
  // Prevent clicks inside modal from closing it
  content.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

async function loadPatientData(patientNum) {
  try {
    console.log(`Fetching data/Patient${patientNum}.txt...`);
    const response = await fetch(`data/Patient${patientNum}.txt`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    console.log('Data file loaded, length:', text.length);
    
    if (!text || text.length === 0) {
      throw new Error('Patient data file is empty');
    }
    
    // Extract timeline sections first (needed for modal)
    const timelineSections = extractTimelineSections(text);
    
    const data = {
      basic: extractPatientData(text),
      readiness: extractReadinessGrid(text),
      riskTrend: extractRiskTrendData(text),
      timeline: extractEventTimeline(text, timelineSections),
      timelineSections: timelineSections, // Store sections for modal
      logistics: extractLogisticsData(text),
      rawText: text
    };
    
    console.log('Data extracted successfully:', {
      basic: data.basic,
      readinessCount: data.readiness.length,
      riskTrendCount: data.riskTrend.length,
      timelineCount: data.timeline.length,
      logisticsCount: data.logistics.length
    });
    
    return data;
  } catch (error) {
    console.error('Error loading patient data:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

// ===== ROUTING =====
function showWelcomePage() {
  const welcomePage = document.getElementById('welcome-page');
  const patientPage = document.getElementById('patient-page');
  
  if (welcomePage) {
    welcomePage.style.display = 'block';
  } else {
    console.error('welcome-page element not found');
  }
  
  if (patientPage) {
    patientPage.style.display = 'none';
  } else {
    console.error('patient-page element not found');
  }
  
  currentPatient = null;
  document.title = 'CAIDF Visualization System';
}

// Global state for clinical events
let clinicalEventsData = null;
let currentFilters = {
  phase: 'all',
  discipline: 'all',
  categories: { problem: true, treatment: true, test: true, occurrence: true },
  collaborationOnly: false
};

/** Phase, discipline, and collaboration-only filters (timeline, matrix views, evidence trend). */
function applySidebarFiltersToEvents(events) {
  let out = Array.isArray(events) ? events.slice() : [];
  if (currentFilters.phase !== 'all') {
    out = out.filter(e => e.phase === currentFilters.phase);
  }
  if (currentFilters.discipline !== 'all') {
    out = out.filter(e => (e.lanes || []).includes(currentFilters.discipline));
  }
  if (currentFilters.collaborationOnly) {
    out = out.filter(e => (e.lanes || []).length > 1);
  }
  return out;
}

// Daily Clinical Evidence palette (filters + stacked trend).
// Order: problem, treatment, test, occurrence.
const EVIDENCE_PANEL_COLORS = {
  problem: '#ca0020',
  treatment: '#f4a582',
  test: '#92c5de',
  occurrence: '#0571b0'
};

// ===== CLINICAL EVENT EXTRACTION (ported from pointlism_doc.py) =====
const PHASES = ["Home", "ER", "Unit", "Discharge", "Post-Discharge"];
const LANE_ORDER = ["MD", "RN", "PT", "OT", "SLP", "SW"];
const DISC_TO_LANE = {
  "MD": "MD", "Physician": "MD", "Doctor": "MD",
  "RN": "RN", "Nurse": "RN",
  "PT": "PT", "Physical Therapy": "PT",
  "OT": "OT", "Occupational Therapy": "OT",
  "SLP": "SLP", "Speech": "SLP", "Speech-Language": "SLP",
  "SW": "SW", "Social Work": "SW",
};

function normalizeDiscToLane(tok) {
  tok = (tok || "").trim().replace("&", "and");
  if (DISC_TO_LANE[tok]) return DISC_TO_LANE[tok];
  for (const [k, v] of Object.entries(DISC_TO_LANE)) {
    if (tok.toLowerCase() === k.toLowerCase()) return v;
  }
  return LANE_ORDER.includes(tok) ? tok : null;
}

function extractDisciplinesToLanes(text) {
  const match = text.match(/Discipline\s*:\s*(.+)$/i);
  if (!match) return [];
  const raw = match[1].trim().split("  ")[0];
  const parts = raw.split(/[,\/\.]/);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const lane = normalizeDiscToLane(p.trim());
    if (lane && !seen.has(lane)) {
      out.push(lane);
      seen.add(lane);
    }
  }
  return out;
}

function updatePhaseFromLine(line, state) {
  const lineStripped = (line || "").trim();
  if (!lineStripped) return;
  
  if (/^Hospital Management:?\s*/i.test(lineStripped)) {
    state.foundHospitalManagement = true;
    state.currentPhase = "Unit";
    return;
  }
  if (/^Discharge Plan:?\s*/i.test(lineStripped)) {
    state.foundDischargePlan = true;
    state.currentPhase = "Discharge";
    return;
  }
  if (/^Plan for follow-?up:?\s*/i.test(lineStripped)) {
    state.foundPlanForFollowUp = true;
    state.currentPhase = "Post-Discharge";
    return;
  }
  if (/^Overview:?\s*/i.test(lineStripped)) {
    state.foundOverview = true;
    state.currentPhase = "ER";
    return;
  }
  if (state.foundOverview && !state.foundHospitalManagement) {
    state.currentPhase = "Home";
    return;
  }
  if (/^(Primary Diagnosis|Most Responsible Diagnosis):?\s*/i.test(lineStripped)) {
    state.foundDiagnosis = true;
    return;
  }
  if (state.foundDiagnosis && !state.foundOverview && !state.foundHospitalManagement) {
    state.currentPhase = "Home";
  }
}

function extractClinicalEventsFromText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const state = {
    currentPhase: null,
    foundDiagnosis: false,
    foundOverview: false,
    foundHospitalManagement: false,
    foundDischargePlan: false,
    foundPlanForFollowUp: false,
  };
  
  const events = [];
  
  for (const line of lines) {
    updatePhaseFromLine(line, state);
    const phase = state.currentPhase;
    
    if (!PHASES.includes(phase)) continue;
    
    // Skip header lines
    if (/^(Patient Name|Age\/?Gender|Admission Date|Discharge Date|Discharge Disposition|Disciplines Involved):?\s*/i.test(line)) {
      continue;
    }
    // Skip section headers only
    if (/^(Hospital Management:?|Discharge Plan:?|Plan for follow-?up:?)\s*$/i.test(line)) {
      continue;
    }
    
    const lanes = extractDisciplinesToLanes(line);
    if (lanes.length === 0) continue;
    
    // Get the content BEFORE the "Discipline:" tag
    const contentBeforeDiscipline = line.replace(/Discipline\s*:\s*.+$/i, '').trim();
    
    // Skip lines that are ONLY "Discipline: XX" with no meaningful content
    // Require at least 10 characters of actual content before the discipline tag
    if (contentBeforeDiscipline.length < 10) {
      continue;
    }
    
    // Use the full content before discipline as the snippet
    events.push({
      phase: phase,
      lanes: lanes,
      snippet: contentBeforeDiscipline,
      len: contentBeforeDiscipline.length
    });
  }
  
  return events;
}

function parseDateFromText(text) {
  if (!text) return null;
  // Try common formats: 1/10/2022, 01/10/2022, 1/10
  const match = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (match) {
    const mo = parseInt(match[1]);
    const da = parseInt(match[2]);
    let yr = match[3] ? parseInt(match[3]) : 2022;
    if (yr < 100) yr += 2000;
    return new Date(yr, mo - 1, da);
  }
  return null;
}

function phaseToDates(admission, discharge) {
  if (!admission || !discharge) return {};
  const day = 24 * 60 * 60 * 1000;
  const a = new Date(admission.getTime());
  const d = new Date(discharge.getTime());
  a.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const daysBetween = Math.floor((d - a) / day);
  
  return {
    "Home": new Date(a.getTime() - day),
    "ER": new Date(a.getTime()),
    "Unit": new Date(a.getTime() + day + Math.floor(daysBetween / 2) * day),
    "Discharge": new Date(d.getTime()),
    "Post-Discharge": new Date(d.getTime() + day),
  };
}

function startOfLocalDay(d) {
  if (!d || Number.isNaN(d.getTime())) return null;
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Parse YYYY-MM-DD as local midnight, or m/d[/y] via parseDateFromText. */
function parseClinicalNoteDateString(str) {
  if (!str) return null;
  if (str instanceof Date && !Number.isNaN(str.getTime())) {
    return startOfLocalDay(str);
  }
  const s = String(str).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const da = parseInt(m[3], 10);
    return new Date(y, mo - 1, da);
  }
  return parseDateFromText(s);
}

/** Format a Date as YYYY-MM-DD in local time (avoid toISOString UTC day shift). */
function formatLocalYmdDate(d) {
  const day = startOfLocalDay(d instanceof Date ? d : parseClinicalNoteDateString(d));
  if (!day) return '';
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const da = String(day.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

/**
 * Calendar day for trend sparklines: first origin note date if it falls in the
 * Home→Post-Discharge window (admit−1 … discharge+1), else phase anchor from phaseToDates.
 * Matches heatmap event/lane counting when combined with the same lane→team mapping.
 */
function eventCalendarDayForSparkline(event, admission, discharge) {
  const dayMs = 86400000;
  const a = startOfLocalDay(admission);
  const d = startOfLocalDay(discharge);
  if (!a || !d) return null;
  const rangeStart = new Date(a.getTime() - dayMs);
  const rangeEnd = new Date(d.getTime() + dayMs);

  const raw = event.origin_notes && event.origin_notes[0] && event.origin_notes[0].date;
  let noteDay = null;
  if (raw) {
    const parsed = parseClinicalNoteDateString(raw);
    if (parsed) noteDay = startOfLocalDay(parsed);
  }
  if (noteDay && !Number.isNaN(noteDay.getTime()) && noteDay >= rangeStart && noteDay <= rangeEnd) {
    return noteDay;
  }

  const anchors = phaseToDates(admission, discharge);
  const phase = event.phase || 'Unit';
  const anchor = anchors[phase] || anchors['Unit'];
  return anchor ? startOfLocalDay(anchor) : null;
}

async function loadFolderNotes(folderPath) {
  // Load notes from folder using manifest file (fast - direct file list)
  // Returns array of {date, lane, text, entities, filename}
  const notes = [];
  const normalizedFolder = folderPath.replace(/\/+$/, '');
  
  try {
    const manifestUrl = `${normalizedFolder}/notes_manifest.json`;
    const manifestResp = await fetch(manifestUrl);
    if (!manifestResp.ok) {
      console.warn(
        `notes_manifest.json not found or unreadable (${manifestResp.status}): ${manifestUrl}. ` +
        `Detailed SpanT/GraphT notes under this folder will be skipped until a manifest is added ` +
        `(see data/UIC_Falls__10707/notes_manifest.json for format).`
      );
      return notes;
    }
    
    const manifest = await manifestResp.json();
    const fileList = manifest.files || [];
    console.log(`Loading ${fileList.length} notes from manifest...`);
    
    // Fetch files in parallel batches
    const batchSize = 15;
    for (let i = 0; i < fileList.length; i += batchSize) {
      const batch = fileList.slice(i, i + batchSize);
      const promises = batch.map(async (fileInfo) => {
        try {
          const resp = await fetch(fileInfo.path);
          if (!resp.ok) return null;
          
          const data = await resp.json();
          // Try paired GraphT file as supplemental source
          let graphData = null;
          try {
            const graphPath = fileInfo.path
              .replace('/SpanTrex_OP/', '/GraphTrex_OP/')
              .replace('/SpanT_', '/GraphT_');
            const graphResp = await fetch(graphPath);
            if (graphResp.ok) {
              graphData = await graphResp.json();
            }
          } catch (_) {}
          // IMPORTANT: do not use new Date("YYYY-MM-DD") — that is UTC and shifts
          // the calendar day backward in US timezones (e.g. 1/11 becomes 1/10).
          const dt = parseClinicalNoteDateString(fileInfo.date);
          if (!dt) return null;
          
          // Extract entities by type for richer data (SpanT types + EVIDENTIAL)
          const entitiesByType = { PROBLEM: [], TREATMENT: [], TEST: [], OCCURRENCE: [], EVIDENTIAL: [] };
          let entityText = '';
          const pushEntity = (e) => {
            if (!e || !e.text) return;
            entityText += e.text + ' ';
            if (entitiesByType[e.type]) entitiesByType[e.type].push(e.text);
          };
          if (data.entities) {
            for (const e of Object.values(data.entities)) pushEntity(e);
          }
          if (graphData && graphData.entities) {
            for (const e of Object.values(graphData.entities)) pushEntity(e);
          }
          
          return {
            date: dt,
            lane: fileInfo.lane,
            text: entityText.trim(),
            entities: data.entities || {},
            entitiesByType,
            filename: fileInfo.path.split('/').pop()
          };
        } catch (e) {
          return null;
        }
      });
      
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r) notes.push(r);
      }
    }
    
    console.log(`Loaded ${notes.length} notes from folder`);
  } catch (e) {
    console.warn(`Could not load folder notes: ${e.message}`);
  }
  
  return notes;
}

function mapDateToPhase(noteDate, admission, discharge) {
  if (!noteDate || !admission || !discharge) return null;
  const day = 24 * 60 * 60 * 1000;
  const n = startOfLocalDay(noteDate instanceof Date ? noteDate : parseClinicalNoteDateString(noteDate));
  const a = startOfLocalDay(admission instanceof Date ? admission : parseClinicalNoteDateString(admission));
  const d = startOfLocalDay(discharge instanceof Date ? discharge : parseClinicalNoteDateString(discharge));
  if (!n || !a || !d) return null;

  // Home window should cover admit-1 through admit date.
  if (n < new Date(a.getTime() - day)) return null;
  if (n.getTime() <= a.getTime()) return "Home";
  const erDate = new Date(a.getTime() + day);
  if (n.getTime() === erDate.getTime()) return "ER";
  if (n > erDate && n < d) return "Unit";
  if (n.getTime() === d.getTime()) return "Discharge";
  if (n <= new Date(d.getTime() + day * 7)) return "Post-Discharge";
  return null;
}

/**
 * Date bounds for each phase — MUST stay aligned with mapDateToPhase().
 * This is what decides which notes belong in which timeline column.
 * Column pixel width is proportional to day count (see buildTimelineDayLayout).
 */
function getPhaseDateBounds(admission, discharge) {
  const a = startOfLocalDay(admission instanceof Date ? admission : parseClinicalNoteDateString(admission));
  const d = startOfLocalDay(discharge instanceof Date ? discharge : parseClinicalNoteDateString(discharge));
  if (!a || !d) return null;
  const day = 24 * 60 * 60 * 1000;
  const er = new Date(a.getTime() + day);
  const unitStart = new Date(a.getTime() + 2 * day);
  const unitEnd = new Date(d.getTime() - day);
  return {
    // Admit day only for a 1-day Preadmission column (notes on admit-1 still map via mapDateToPhase).
    Home: [a, a],
    ER: [er, er],
    Unit: unitEnd >= unitStart ? [unitStart, unitEnd] : [unitStart, unitStart],
    Discharge: [d, d],
    // One-day post column; later post notes still classify as Post-Discharge and sit here.
    'Post-Discharge': [new Date(d.getTime() + day), new Date(d.getTime() + day)]
  };
}

/** Report/note date for placing a circle (JSON date first). */
function getEventAnchorDate(event, admission, discharge) {
  if (event?.origin_notes?.length) {
    const sorted = event.origin_notes
      .map(n => parseClinicalNoteDateString(n.date))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (sorted.length) return startOfLocalDay(sorted[0]);
  }
  const bounds = getPhaseDateBounds(admission, discharge);
  const range = bounds && event?.phase ? bounds[event.phase] : null;
  if (range) {
    return startOfLocalDay(new Date((range[0].getTime() + range[1].getTime()) / 2));
  }
  return startOfLocalDay(admission);
}

/**
 * Day-proportional column layout: each calendar day gets the same pixel width.
 * Unit (many days) is wider than Discharge (one day).
 */
function buildTimelineDayLayout(admission, discharge, chartWidth) {
  const dayMs = 24 * 60 * 60 * 1000;
  const bounds = getPhaseDateBounds(admission, discharge);
  if (!bounds) return null;

  const phases = TIMELINE_PHASES.map(phase => {
    const range = bounds[phase];
    const start = startOfLocalDay(range[0]);
    const end = startOfLocalDay(range[1]);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
    return { phase, start, end, days, x0: 0, x1: 0, width: 0 };
  });

  const totalDays = phases.reduce((sum, p) => sum + p.days, 0) || 1;
  let x = 0;
  phases.forEach(p => {
    p.width = (p.days / totalDays) * chartWidth;
    p.x0 = x;
    p.x1 = x + p.width;
    x = p.x1;
  });

  const byPhase = Object.fromEntries(phases.map(p => [p.phase, p]));

  const dateToDaySlot = (date) => {
    const d = startOfLocalDay(date instanceof Date ? date : parseClinicalNoteDateString(date));
    const fallback = { x0: 0, x1: chartWidth, width: chartWidth, centerX: chartWidth / 2 };
    if (!d) return fallback;

    const mapped = mapDateToPhase(d, admission, discharge);
    let p = mapped ? byPhase[mapped] : null;
    if (!p) {
      p = phases.find(ph => d.getTime() >= ph.start.getTime() && d.getTime() <= ph.end.getTime())
        || (d < phases[0].start ? phases[0] : phases[phases.length - 1]);
    }
    if (!p) return fallback;

    let dayIndex = Math.round((d.getTime() - p.start.getTime()) / dayMs);
    dayIndex = Math.max(0, Math.min(p.days - 1, dayIndex));
    const dayWidth = p.width / p.days;
    const x0 = p.x0 + dayIndex * dayWidth;
    return { x0, x1: x0 + dayWidth, width: dayWidth, centerX: x0 + dayWidth / 2 };
  };

  const dateToX = (date) => dateToDaySlot(date).centerX;

  const days = [];
  phases.forEach((p) => {
    const dayWidth = p.days ? (p.width / p.days) : p.width;
    for (let i = 0; i < p.days; i++) {
      const d = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() + i);
      const x0 = p.x0 + i * dayWidth;
      days.push({
        date: d,
        key: `${d.getMonth() + 1}/${d.getDate()}`,
        phase: p.phase,
        x0,
        width: dayWidth,
        x1: x0 + dayWidth,
        centerX: x0 + dayWidth / 2
      });
    }
  });

  return { phases, byPhase, days, dateToX, dateToDaySlot, totalDays, chartWidth };
}

/** Equal-width column per calendar day from Preadmission through Post-Discharge. */
function buildEqualDayLayout(admission, discharge, chartWidth) {
  const dayMs = 24 * 60 * 60 * 1000;
  const bounds = getPhaseDateBounds(admission, discharge);
  if (!bounds) return null;
  const start = startOfLocalDay(bounds.Home[0]);
  const end = startOfLocalDay(bounds['Post-Discharge'][1] || bounds.Discharge[1]);
  if (!start || !end) return null;

  const days = [];
  for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
    const d = new Date(t);
    days.push({
      date: d,
      key: `${d.getMonth() + 1}/${d.getDate()}`,
      phase: mapDateToPhase(d, admission, discharge)
    });
  }
  const n = days.length || 1;
  const colW = chartWidth / n;
  days.forEach((day, i) => {
    day.x0 = i * colW;
    day.width = colW;
    day.x1 = day.x0 + colW;
    day.centerX = day.x0 + colW / 2;
  });

  const dateToDaySlot = (date) => {
    const d = startOfLocalDay(date instanceof Date ? date : parseClinicalNoteDateString(date));
    const fallback = { x0: 0, x1: chartWidth, width: chartWidth, centerX: chartWidth / 2 };
    if (!d || !days.length) return fallback;
    let idx = Math.round((d.getTime() - start.getTime()) / dayMs);
    idx = Math.max(0, Math.min(days.length - 1, idx));
    const day = days[idx];
    return { x0: day.x0, x1: day.x1, width: day.width, centerX: day.centerX };
  };

  const phases = TIMELINE_PHASES.map((phase) => {
    const inPhase = days.filter(dd => dd.phase === phase);
    if (!inPhase.length) return { phase, days: 0, x0: 0, x1: 0, width: 0 };
    return {
      phase,
      days: inPhase.length,
      x0: inPhase[0].x0,
      x1: inPhase[inPhase.length - 1].x1,
      width: inPhase[inPhase.length - 1].x1 - inPhase[0].x0
    };
  }).filter(p => p.width > 0);

  return {
    days,
    phases,
    dateToDaySlot,
    dateToX: (date) => dateToDaySlot(date).centerX,
    totalDays: n,
    chartWidth
  };
}

let timelineDayGradSeq = 0;

function appendSequentialDayBands(g, layout, admit, discharge, chartHeight) {
  if (!layout || !admit || !discharge) return;
  const chartWidth = layout.chartWidth;
  if (!(chartWidth > 0) || !(chartHeight > 0)) return;

  const svgEl = g.node() && g.node().ownerSVGElement;
  if (!svgEl) return;
  const svg = d3.select(svgEl);
  let defs = svg.select('defs');
  if (defs.empty()) defs = svg.insert('defs', ':first-child');

  const days = (layout.days && layout.days.length)
    ? layout.days
    : null;
  const gradId = `tl-day-seq-${++timelineDayGradSeq}`;
  const grad = defs.append('linearGradient')
    .attr('id', gradId)
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', chartWidth)
    .attr('y2', 0);

  if (days) {
    const n = days.length;
    grad.append('stop')
      .attr('offset', 0)
      .attr('stop-color', timelineDayFillByIndex(0, n));
    days.forEach((day, i) => {
      const offset = Math.max(0, Math.min(1, day.centerX / chartWidth));
      grad.append('stop')
        .attr('offset', offset)
        .attr('stop-color', timelineDayFillByIndex(i, n));
    });
    grad.append('stop')
      .attr('offset', 1)
      .attr('stop-color', timelineDayFillByIndex(n - 1, n));
  } else {
    const bounds = getPhaseDateBounds(admit, discharge);
    if (!bounds) return;
    const start = startOfLocalDay(bounds.Home[0]);
    const end = startOfLocalDay(bounds['Post-Discharge'][1] || bounds.Discharge[1]);
    const list = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor.getTime() <= last.getTime()) {
      list.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    const n = list.length || 1;
    list.forEach((d, i) => {
      const slot = layout.dateToDaySlot(d);
      const offset = Math.max(0, Math.min(1, slot.centerX / chartWidth));
      if (i === 0) {
        grad.append('stop')
          .attr('offset', 0)
          .attr('stop-color', timelineDayFillByIndex(0, n));
      }
      grad.append('stop')
        .attr('offset', offset)
        .attr('stop-color', timelineDayFillByIndex(i, n));
      if (i === n - 1) {
        grad.append('stop')
          .attr('offset', 1)
          .attr('stop-color', timelineDayFillByIndex(n - 1, n));
      }
    });
  }

  g.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', chartWidth)
    .attr('height', chartHeight)
    .attr('fill', `url(#${gradId})`)
    .attr('pointer-events', 'none');
}

function appendVerticalDayGuides(g, layout, chartHeight) {
  const days = layout && layout.days;
  if (!days || !days.length) return;
  days.forEach((day, i) => {
    if (i === 0) return;
    g.append('line')
      .attr('x1', day.x0)
      .attr('x2', day.x0)
      .attr('y1', 0)
      .attr('y2', chartHeight)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.7)
      .attr('pointer-events', 'none');
  });
}

function appendDayAxisLabels(g, layout, chartHeight) {
  const days = layout && layout.days;
  if (!days || !days.length) return;
  const dayFont = days.length > 14 ? '14px' : '16px';
  days.forEach((day) => {
    g.append('text')
      .attr('x', day.centerX)
      .attr('y', chartHeight + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', dayFont)
      .attr('font-weight', '700')
      .attr('fill', '#111827')
      .text(day.key);
  });
}

/**
 * Spread events that share a calendar day across that day's pixel slot
 * so circles do not stack on one X. Stays inside the day (does not cross into neighbors).
 */
function assignSpreadXByDay(events, layout, admit, discharge) {
  const xByEvent = new Map();
  if (!layout || !events || !events.length) return xByEvent;

  const groups = new Map();
  events.forEach((event) => {
    const day = getEventAnchorDate(event, admit, discharge);
    const key = formatLocalYmdDate(day) || '_';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });

  groups.forEach((group) => {
    const slot = layout.dateToDaySlot(getEventAnchorDate(group[0], admit, discharge));
    const n = group.length;
    const edgePad = Math.max(2, slot.width * 0.14);
    const usable = Math.max(1, slot.width - edgePad * 2);
    group.forEach((event, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      xByEvent.set(event, slot.x0 + edgePad + t * usable);
    });
  });

  return xByEvent;
}

function getPatientStayDates() {
  const admit = parseDateFromText(patientData?.basic?.admitDate)
    || parsePatientDashboardDate(patientData?.basic?.admitDate)
    || (clinicalEventsData?.admission ? parseClinicalNoteDateString(clinicalEventsData.admission) : null);
  const discharge = parseDateFromText(patientData?.basic?.dischargeDate)
    || parsePatientDashboardDate(patientData?.basic?.dischargeDate)
    || (clinicalEventsData?.discharge ? parseClinicalNoteDateString(clinicalEventsData.discharge) : null);
  return { admit, discharge };
}

/** Move event into the column that matches its report/note date(s). */
function realignEventPhaseFromNotes(event, admission, discharge) {
  const notes = event.origin_notes || [];
  if (!notes.length || !admission || !discharge) return;

  const noteDays = notes
    .map(n => ({ note: n, day: parseClinicalNoteDateString(n.date) }))
    .filter(x => x.day)
    .sort((a, b) => a.day - b.day);
  if (!noteDays.length) return;

  const phase = mapDateToPhase(noteDays[0].day, admission, discharge);
  if (!phase) return;
  event.phase = phase;

  // Keep only notes whose JSON date maps to this same phase/column.
  event.origin_notes = noteDays
    .filter(x => mapDateToPhase(x.day, admission, discharge) === phase)
    .map(x => x.note);
}

function buildTimelineEventsFromNotes(notes, admission, discharge) {
  if (!notes || !notes.length || !admission || !discharge) return [];

  return notes
    .map((note) => {
      const phase = mapDateToPhase(note.date, admission, discharge);
      if (!phase) return null;
      const lanes = note.lane ? [note.lane] : [];
      if (!lanes.length) return null;
      const snippet = (note.text || '').trim() || `Clinical note: ${note.filename || 'unknown'}`;
      return {
        phase,
        lanes,
        snippet,
        len: snippet.length,
        source: 'raw_note',
        origin_notes: [{
          text: note.text || '',
          date: formatLocalYmdDate(note.date),
          lane: note.lane,
          filename: note.filename || '',
          entitiesByType: note.entitiesByType || null,
          entities: note.entities || null
        }],
        entityCounts: {
          PROBLEM: (note.entitiesByType?.PROBLEM || []).length,
          TREATMENT: (note.entitiesByType?.TREATMENT || []).length,
          TEST: (note.entitiesByType?.TEST || []).length,
          OCCURRENCE: (note.entitiesByType?.OCCURRENCE || []).length
        }
      };
    })
    .filter(Boolean);
}

// Legacy function for backwards compatibility
async function loadZipNotes(zipUrl) {
  // Try folder first, fall back to ZIP
  const folderPath = zipUrl.replace('.zip', '');
  const folderNotes = await loadFolderNotes(folderPath);
  if (folderNotes.length > 0) {
    return folderNotes;
  }
  
  // Fallback to ZIP loading
  const notes = [];
  try {
    const response = await fetch(zipUrl);
    if (!response.ok) return notes;
    
    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const folderToLane = { "md": "MD", "rn": "RN", "pt": "PT", "ot": "OT", "slp": "SLP", "sw": "SW" };
    
    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || filename.includes("__MACOSX") || filename.startsWith(".")) continue;
      const parts = filename.replace(/\\/g, "/").split("/");
      let folder = null;
      for (const p of parts) {
        if (folderToLane[p.toLowerCase()]) { folder = p.toLowerCase(); break; }
      }
      if (!folder) continue;
      const lane = folderToLane[folder];
      if (!lane || !filename.toLowerCase().endsWith(".txt")) continue;
      
      try {
        const text = await file.async("string");
        const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          notes.push({
            date: new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3])),
            lane, text: text.trim(), filename: parts[parts.length - 1]
          });
        }
      } catch (e) {}
    }
  } catch (e) {}
  return notes;
}

function attachOriginNotesToEvents(events, zipNotes, admission, discharge) {
  if (!zipNotes || zipNotes.length === 0 || !admission || !discharge) return;

  for (const event of events) {
    const phase = event.phase;
    const lanes = new Set(event.lanes);
    if (!phase) continue;

    const origin = [];
    const entityCounts = { PROBLEM: 0, TREATMENT: 0, TEST: 0, OCCURRENCE: 0 };

    for (const note of zipNotes) {
      const noteDate = startOfLocalDay(note.date);
      if (!noteDate || !lanes.has(note.lane)) continue;
      if (mapDateToPhase(noteDate, admission, discharge) !== phase) continue;

      origin.push({
        text: note.text,
        date: formatLocalYmdDate(noteDate),
        lane: note.lane,
        filename: note.filename,
        entitiesByType: note.entitiesByType || null,
        entities: note.entities || null
      });

      if (note.entitiesByType) {
        for (const [type, items] of Object.entries(note.entitiesByType)) {
          if (entityCounts[type] !== undefined) {
            entityCounts[type] += (items || []).length;
          }
        }
      }
    }

    if (origin.length > 0) {
      event.origin_notes = origin;
      event.entityCounts = entityCounts;
      realignEventPhaseFromNotes(event, admission, discharge);
    }
  }
}

async function generateClinicalEventsData(patientNum, rawText) {
  console.log('Generating clinical events from Patient text...');
  
  // Extract events from patient text
  const summaryEvents = extractClinicalEventsFromText(rawText);
  console.log(`Extracted ${summaryEvents.length} events from text`);
  
  // Parse admission and discharge dates
  const admitMatch = rawText.match(/Admission Date:\s*(.+)/i);
  const dischargeMatch = rawText.match(/Discharge Date:\s*(.+)/i);
  const admission = admitMatch ? parseDateFromText(admitMatch[1]) : null;
  const discharge = dischargeMatch ? parseDateFromText(dischargeMatch[1]) : null;
  
  console.log('Dates:', { admission, discharge });
  
  // Patient-specific detailed source (no cross-patient fallback).
  // loadZipNotes() first tries folderPath = zipUrl.replace('.zip',''), so using
  // "Patient_12738_OP.zip" will target "data/Patient_12738_OP/".
  const detailSourceByPatient = {
    1: 'data/UIC_Falls__10707.zip',
    2: 'data/Patient_12738_OP.zip',
  };
  const zipUrl = detailSourceByPatient[patientNum];
  if (!zipUrl) {
    console.warn(`No detailed source configured for patient ${patientNum}`);
  }
  const zipNotes = zipUrl ? await loadZipNotes(zipUrl) : [];
  
  // Attach origin notes to summary events if raw notes were loaded
  if (zipNotes.length > 0) {
    attachOriginNotesToEvents(summaryEvents, zipNotes, admission, discharge);
    console.log('Attached origin notes to summary events');
  }

  // Build additional timeline events directly from note-level SpanT/GraphT data
  const noteEvents = buildTimelineEventsFromNotes(zipNotes, admission, discharge);
  console.log(`Built ${noteEvents.length} note-level events from SpanT/GraphT`);

  // Merge summary + note events so pointillism reflects all patient data
  const events = [...summaryEvents, ...noteEvents];
  // Final safety: every event with a report date sits in that date's column.
  events.forEach(ev => realignEventPhaseFromNotes(ev, admission, discharge));
  
  return {
    events: events,
    admission: admission ? formatLocalYmdDate(admission) : null,
    discharge: discharge ? formatLocalYmdDate(discharge) : null
  };
}

async function showDashboard(patientNum) {
  console.log('showDashboard called with patient:', patientNum);
  
  try {
    currentPatient = patientNum;
    currentMatrixMode = 'all_patient_summary';
    
    // Show loading state
    const welcomePage = document.getElementById('welcome-page');
    const patientPage = document.getElementById('patient-page');
    
    if (!welcomePage || !patientPage) {
      console.error('Required page elements not found');
      alert('Error: Page structure not found');
      return;
    }
    
    console.log('Loading patient data...');
    patientData = await loadPatientData(patientNum);
    
    if (!patientData) {
      console.error('Failed to load patient data');
      alert('Error loading patient data. Please check the console for details.');
      return;
    }
    
    // Generate clinical events data from Patient text (same logic as pointlism_doc.py)
    console.log('Generating clinical events from patient data...');
    try {
      clinicalEventsData = await generateClinicalEventsData(patientNum, patientData.rawText);
      console.log('Clinical events generated:', clinicalEventsData.events?.length || 0, 'events');
    } catch (e) {
      console.warn('Could not generate clinical events:', e);
      clinicalEventsData = { events: [] };
    }
    
    console.log('Patient data loaded successfully:', patientData);

    // Load question data for the Questions view
    try {
      questionData = await loadQuestionData();
      console.log('Question data loaded successfully:', questionData);
    } catch (error) {
      console.warn('Question data could not be loaded:', error);
      questionData = null;
    }
    
    // Hide welcome page and show dashboard
    welcomePage.style.display = 'none';
    patientPage.style.display = 'block';
    
    // Update patient number display
    const patientNumberDisplay = document.getElementById('patient-number-display');
    if (patientNumberDisplay) {
      patientNumberDisplay.textContent = patientNum;
    }

    const matrixModeSelect = document.getElementById('matrix-mode-select');
    if (matrixModeSelect) {
      matrixModeSelect.value = currentMatrixMode;
    }

    document.title = 'Patient ' + patientNum;
    
    // Render all NEW components - use requestAnimationFrame to ensure containers are sized
    console.log('Rendering new dashboard components...');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderPatientInfoSidebar();
        renderEpisodeSummary();
        renderFilters();
        renderClinicalTimeline();
        renderReadinessMatrix();
        renderQuestionsPanel();
        console.log('All new components rendered');
      });
    });
    
    // Add window resize handler
    window.addEventListener('resize', function() {
      if (currentPatient) {
        clearTimeout(window.resizeTimeout);
        window.resizeTimeout = setTimeout(() => {
          console.log('Window resized, re-rendering...');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              renderClinicalTimeline();
              renderReadinessMatrix();
            });
          });
        }, 250);
      }
    });
    
  } catch (error) {
    console.error('Error in showDashboard:', error);
    alert('Error loading dashboard: ' + error.message);
  }
}

// Note: handleSelectPatient and handleBackToWelcome are defined at the top of the file
// for Chrome compatibility

function goBackToWelcome() {
  showWelcomePage();
}

// ===== RENDER FUNCTIONS =====

function renderPatientInfo() {
  const container = document.getElementById('patient-info-container');
  const data = patientData.basic;
  
  // Calculate responsive font sizes based on container width
  const containerWidth = container.clientWidth || container.offsetWidth || 300;
  const baseFontScale = Math.max(0.7, Math.min(1, containerWidth / 250));
  
  container.innerHTML = `
    <div class="patient-info-header">
      <h2 class="patient-info-title">Patient Information</h2>
    </div>
    <div class="patient-info-grid" style="font-size: ${baseFontScale}em;">
      <div class="patient-info-item">
        <span class="patient-info-label">Name:</span>
        <span class="patient-info-value">${data.name}</span>
      </div>
      <div class="patient-info-item">
        <span class="patient-info-label">Age:</span>
        <span class="patient-info-value">${data.age}</span>
      </div>
      <div class="patient-info-item">
        <span class="patient-info-label">Gender:</span>
        <span class="patient-info-value">${data.gender}</span>
      </div>
      <div class="patient-info-item">
        <span class="patient-info-label">Admit Date:</span>
        <span class="patient-info-value">${data.admitDate}</span>
      </div>
      <div class="patient-info-item">
        <span class="patient-info-label">Discharge Date:</span>
        <span class="patient-info-value">${data.dischargeDate}</span>
      </div>
      <div class="patient-info-item full-width">
        <span class="patient-info-label">Diagnosis:</span>
        <span class="patient-info-value">${data.diagnosis}</span>
      </div>
      ${data.disciplinesInvolved ? `
      <div class="patient-info-item full-width">
        <span class="patient-info-label">Disciplines Involved:</span>
        <span class="patient-info-value">${data.disciplinesInvolved}</span>
      </div>
      ` : ''}
    </div>
  `;
}

// VERTICAL TIMELINE VERSION - Phases on Y-axis, Event Count on X-axis
function renderTimeline() {
  const container = document.getElementById('timeline-chart');
  if (!container) {
    console.error('Timeline chart container not found!');
    return;
  }
  container.innerHTML = '';
  
  const timelineData = patientData.timeline;
  if (!timelineData || timelineData.length === 0) {
    console.warn('No timeline data available');
    return;
  }
  
  const margin = { top: 65, right: 30, bottom: 40, left: 80 };
  
  // Get container dimensions with fallback
  let width = container.clientWidth;
  let height = container.clientHeight;
  
  // If container has no size, wait a bit and try again, or use fallback
  if (!width || width <= 0) {
    width = container.offsetWidth || container.parentElement?.clientWidth || 600;
  }
  if (!height || height <= 0) {
    height = container.offsetHeight || container.parentElement?.clientHeight || 400;
  }
  
  // Ensure minimum dimensions
  width = Math.max(width, 300);
  height = Math.max(height, 200);
  
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // Validate chart dimensions
  if (chartWidth <= 0 || chartHeight <= 0) {
    console.error('Invalid chart dimensions:', { width, height, chartWidth, chartHeight });
    return;
  }
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  // Title
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', margin.top / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', '#111827')
    .attr('font-size', '23px')
    .attr('font-weight', '600')
    .text('Clinical Events Timeline');
  
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', margin.top / 2 + 18)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6B7280')
    .attr('font-size', '17px')
    .text('Key events across the patient\'s care stages');
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Phase labels mapping - order from top to bottom
  const phaseLabels = {
    home: 'Home',
    er: 'ER',
    unit: 'Unit',
    discharge: 'Discharge',
    back_home: 'Post-Discharge'
  };
  
  // Define phase order (top to bottom)
  const phaseOrder = ['home', 'er', 'unit', 'discharge', 'back_home'];
  
  // Filter and sort phase data according to phaseOrder
  const phaseData = phaseOrder
    .map(phaseKey => {
      const found = timelineData.find(d => d.phase === phaseKey);
      if (found && found.count > 0) {
        return {
          phase: phaseKey,
          label: found.label || phaseLabels[phaseKey] || phaseKey,
          count: found.count,
          sections: found.sections || []
        };
      }
      return null;
    })
    .filter(d => d !== null);
  
  if (phaseData.length === 0) {
    console.warn('No phase data after filtering');
    return;
  }
  
  // Scales - X-axis for Event Count, Y-axis for Timeline Phase
  // Domain starts at 0 since curve must stop at y-axis (x=0)
  const maxCount = d3.max(phaseData, d => d.count) || 1;
  const x = d3.scaleLinear()
    .domain([0, maxCount * 1.15])
    .nice()
    .range([0, chartWidth]);
  
  // Y-axis: phases from top to bottom (Home at top, Post-Discharge at bottom)
  const y = d3.scalePoint()
    .domain(phaseData.map(d => d.label))
    .range([0, chartHeight])
    .padding(0.5);
  
  // Add clip paths
  const defs = svg.append('defs');
  
  // Clip path to prevent grid lines from extending above chart area
  const chartClip = defs.append('clipPath')
    .attr('id', 'chart-clip');
  
  chartClip.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', chartWidth)
    .attr('height', chartHeight);
  
  // Clip path to prevent line/area from extending beyond chart boundaries
  // Clips to the right of x=0 (y-axis) to prevent negative values
  const xAxisClip = defs.append('clipPath')
    .attr('id', 'x-axis-clip');
  
  xAxisClip.append('rect')
    .attr('x', 0)  // Start at x=0 (y-axis) - nothing to the left
    .attr('y', -1000)  // Extend far above to cover start point
    .attr('width', chartWidth + 100)  // Extend to right edge and beyond
    .attr('height', chartHeight + 2000);  // Extend far below to cover end point
  
  // Grid lines (vertical lines for event count) - only within chart area
  const grid = g.append('g')
    .attr('class', 'grid')
    .attr('opacity', 0.1)
    .attr('clip-path', 'url(#chart-clip)');
  
  // Create grid lines manually to ensure they only extend upward
  const xTicks = x.ticks(5);
  grid.selectAll('line')
    .data(xTicks)
    .enter()
    .append('line')
    .attr('x1', d => x(d))
    .attr('x2', d => x(d))
    .attr('y1', 0)
    .attr('y2', chartHeight)
    .attr('stroke', '#E5E7EB')
    .attr('stroke-width', 1);
  
  // Create line data - each point represents a phase with its event count (no artificial start/end at x=0)
  const phasePoints = phaseData.map(d => ({
    phase: d.phase,
    label: d.label,
    count: d.count,
    sections: d.sections,
    x: x(d.count),
    y: y(d.label)
  }));
  
  // Line: smooth curve through phase points (Catmull-Rom for rounded transitions, no sharp corners)
  const lineData = phasePoints;
  const smoothCurve = d3.curveCatmullRom.alpha(0.5); // Centripetal Catmull-Rom: smooth and rounded
  const line = d3.line()
    .x(d => d.x)
    .y(d => d.y)
    .curve(smoothCurve);
  
  // Area: same smooth curve for fill boundary
  const area = d3.area()
    .x0(0)
    .x1(d => Math.max(0, d.x))
    .y(d => d.y)
    .curve(smoothCurve);
  
  // Draw area first (so line appears on top)
  g.append('path')
    .datum(lineData)
    .attr('fill', 'rgba(129, 212, 250, 0.25)')
    .attr('clip-path', 'url(#x-axis-clip)')
    .attr('d', area);
  
  // Draw smooth curve through points only (no dip to x=0)
  g.append('path')
    .datum(lineData)
    .attr('fill', 'none')
    .attr('stroke', '#2563EB')
    .attr('stroke-width', 2)
    .attr('clip-path', 'url(#x-axis-clip)')
    .attr('d', line);
  
  // Create tooltip
  const timelineTooltip = d3.select('body')
    .select('.timeline-tooltip')
    .node() ? d3.select('body').select('.timeline-tooltip') :
    d3.select('body')
      .append('div')
      .attr('class', 'timeline-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', 'rgba(30, 41, 59, 0.95)')
      .style('color', '#e2e8f0')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '16px')
      .style('opacity', 0)
      .style('z-index', '1000')
      .style('border', '1px solid #64748b');
  
  // Points with tooltips and click handlers
  const dots = g.selectAll('.dot')
    .data(phaseData)
    .join('circle')
    .attr('class', 'dot phase-dot')
    .attr('cx', d => x(d.count))
    .attr('cy', d => y(d.label))
    .attr('r', 6)
    .attr('fill', '#ff7f50')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer');
  
  dots.on('mouseover', function(event, d) {
    d3.select(this).attr('r', 9);
    
    const textLines = [`${d.label}: ${d.count} events`];
    if (d.sections && d.sections.length > 0) {
      const firstSection = d.sections[0];
      if (firstSection.content) {
        const contentLines = firstSection.content.split('\n').filter(l => l.trim());
        if (contentLines.length > 0) {
          const firstLine = contentLines[0].replace(/^•\s*/, '').trim();
          const preview = firstLine.length > 40 ? firstLine.substring(0, 37) + '...' : firstLine;
          textLines.push(`  ${preview}`);
        }
      }
    }
    
    timelineTooltip.style('opacity', 1)
      .html(textLines.map((line, i) => 
        `<div style="font-weight:${i === 0 ? '600' : '400'};${i > 0 ? 'margin-top:4px;' : ''}">${line}</div>`
      ).join(''))
      .style('left', (event.clientX + 15) + 'px')
      .style('top', (event.clientY - 60) + 'px');
  })
  .on('mousemove', function(event) {
    timelineTooltip
      .style('left', (event.clientX + 15) + 'px')
      .style('top', (event.clientY - 60) + 'px');
  })
  .on('mouseout', function() {
    d3.select(this).attr('r', 6);
    timelineTooltip.style('opacity', 0);
  })
  .on('click', function(event, d) {
    const phaseKey = d.phase;
    if (!phaseKey) return;
    
    const phaseSections = patientData.timelineSections 
      ? patientData.timelineSections.filter(s => s.phase === phaseKey)
      : d.sections || [];
    
    if (phaseSections.length > 0) {
      showTimelineModal(phaseKey, phaseSections);
    } else {
      alert(`No detailed events found for ${d.label || phaseKey}`);
    }
  });
  
  // Axes
  // X-axis at bottom: Event Count (can show negative values)
  const xAxis = g.append('g')
    .attr('transform', `translate(0,${chartHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')));
  
  xAxis.selectAll('text')
    .attr('fill', '#6B7280')
    .attr('font-size', '16px');
  
  xAxis.selectAll('line, path')
    .attr('stroke', '#E5E7EB');
  
  xAxis.append('text')
    .attr('x', chartWidth)
    .attr('y', 32)
    .attr('fill', '#2563EB')
    .attr('font-weight', 600)
    .attr('font-size', '17px')
    .attr('text-anchor', 'end')
    .text('Event Count');
  
  // Y-axis on left: Timeline Phase
  const yAxis = g.append('g')
    .call(d3.axisLeft(y));
  
  yAxis.selectAll('text')
    .attr('fill', '#6B7280')
    .attr('font-size', '17px')
    .attr('font-weight', '500')
    .style('cursor', 'pointer');
  
  yAxis.selectAll('line, path')
    .attr('stroke', '#E5E7EB');
  
  yAxis.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -chartHeight / 2)
    .attr('y', -50)
    .attr('fill', '#2563EB')
    .attr('font-weight', 600)
    .attr('font-size', '17px')
    .attr('text-anchor', 'middle')
    .text('Timeline Phase');
}

function renderLogistics() {
  const parentContainer = document.getElementById('patient-logistic-container');
  if (!parentContainer) return;
  
  // Clear and recreate the SVG container
  parentContainer.innerHTML = '<div class="logistic-svg-container"><svg id="logistic-svg"></svg></div>';
  
  const svgElement = document.getElementById('logistic-svg');
  if (!svgElement) return;
  
  const logisticsData = patientData.logistics;
  if (!logisticsData || logisticsData.length === 0) return;
  
  // Get container dimensions with validation
  let containerWidth = parentContainer.clientWidth || parentContainer.offsetWidth || 400;
  let containerHeight = parentContainer.clientHeight || parentContainer.offsetHeight || 280;
  
  // Ensure minimum dimensions
  containerWidth = Math.max(containerWidth, 200);
  containerHeight = Math.max(containerHeight, 150);
  
  // Calculate responsive font sizes based on container dimensions
  const baseFontScale = Math.max(0.6, Math.min(1, containerWidth / 350));
  const titleFontSize = Math.max(16, Math.min(20, containerWidth * 0.048));
  const labelFontSize = Math.max(14, Math.min(18, containerWidth * 0.042));
  const percentFontSize = Math.max(14, Math.min(18, containerWidth * 0.042));
  
  // Responsive margins based on container size
  const margin = { 
    top: Math.max(35, containerHeight * 0.15), 
    right: Math.max(20, containerWidth * 0.08), 
    bottom: Math.max(15, containerHeight * 0.08), 
    left: Math.max(80, containerWidth * 0.3)
  };
  
  const width = containerWidth;
  const height = containerHeight;
  
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // Validate chart dimensions
  if (chartWidth <= 0 || chartHeight <= 0) {
    console.error('Invalid logistics chart dimensions:', { width, height, chartWidth, chartHeight });
    return;
  }
  
  const svg = d3.select('#logistic-svg');
  svg.attr('width', width).attr('height', height);
  
  // Title - centered like Patient Information, with responsive font size
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', Math.max(20, margin.top * 0.7))
    .attr('text-anchor', 'middle')
    .attr('font-size', `${titleFontSize}px`)
    .attr('font-weight', '600')
    .attr('fill', '#111827')
    .text('Patient Logistics & Education');
  
  // Move graph down by increasing top margin and adjusting transform
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top + Math.max(20, containerHeight * 0.1)})`);
  
  // Calculate responsive bar dimensions
  const totalBars = logisticsData.length;
  const availableHeight = chartHeight - Math.max(20, containerHeight * 0.1);
  const barSpacing = Math.max(8, availableHeight * 0.08);
  const barHeight = Math.max(15, Math.min(30, (availableHeight - (barSpacing * (totalBars - 1))) / totalBars));
  
  // Create tooltip for logistics (once, outside loop)
  const logisticsTooltip = d3.select('body')
    .select('.logistics-tooltip')
    .node() ? d3.select('body').select('.logistics-tooltip') :
    d3.select('body')
      .append('div')
      .attr('class', 'logistics-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', 'rgba(0,0,0,0.85)')
      .style('color', '#fff')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '17px')
      .style('opacity', 0)
      .style('z-index', '1000');
  
  logisticsData.forEach((sec, i) => {
    const y = i * (barHeight + barSpacing);
    
    // Label with responsive font size
    g.append('text')
      .attr('x', -10)
      .attr('y', y + barHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', `${labelFontSize}px`)
      .attr('font-weight', '600')
      .attr('fill', '#111827')
      .text(sec.title);
    
    // Background bar with responsive border radius
    const barRadius = Math.min(6, barHeight * 0.2);
    g.append('rect')
      .attr('x', 0)
      .attr('y', y)
      .attr('width', chartWidth)
      .attr('height', barHeight)
      .attr('rx', barRadius)
      .attr('fill', '#F3F4F6');
    
    // Progress bar with tooltip
    const progressBar = g.append('rect')
      .attr('x', 0)
      .attr('y', y)
      .attr('width', chartWidth * sec.progress)
      .attr('height', barHeight)
      .attr('rx', barRadius)
      .attr('fill', sec.color)
      .style('cursor', 'pointer');
    
    // Percentage text with responsive font size
    g.append('text')
      .attr('x', chartWidth - 10)
      .attr('y', y + barHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', `${percentFontSize}px`)
      .attr('font-weight', '600')
      .attr('fill', '#111827')
      .text(`${Math.round(sec.progress * 100)}%`);
    
    // Add hover to progress bar
    progressBar
      .on('pointerenter', function(event) {
        d3.select(this).attr('opacity', 0.8);
        const percent = Math.round(sec.progress * 100);
        logisticsTooltip.style('opacity', 1)
          .html(`
            <div style="font-weight:600;margin-bottom:4px;">${sec.title}</div>
            <div><strong>Progress:</strong> ${percent}%</div>
            <div style="font-size:16px;margin-top:4px;opacity:0.9;">${sec.title} completion status</div>
          `)
          .style('left', (event.clientX + 15) + 'px')
          .style('top', (event.clientY - 60) + 'px');
      })
      .on('pointermove', function(event) {
        logisticsTooltip
          .style('left', (event.clientX + 15) + 'px')
          .style('top', (event.clientY - 60) + 'px');
      })
      .on('pointerleave', function() {
        d3.select(this).attr('opacity', 1);
        logisticsTooltip.style('opacity', 0);
      });
  });
}

function renderRiskTrend() {
  const container = document.getElementById('risk-trend-container');
  if (!container) return;
  container.innerHTML = '';
  
  const riskData = patientData.riskTrend;
  if (!riskData || riskData.length === 0) return;
  
  const margin = { top: 60, right: 100, bottom: 50, left: 60 };
  
  // Get container dimensions with validation
  let width = container.clientWidth || container.offsetWidth || 400;
  let height = container.clientHeight || container.offsetHeight || 300;
  
  // Ensure minimum dimensions
  width = Math.max(width, 300);
  height = Math.max(height, 200);
  
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // Validate chart dimensions
  if (chartWidth <= 0 || chartHeight <= 0) {
    console.error('Invalid risk trend chart dimensions:', { width, height, chartWidth, chartHeight });
    return;
  }
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Title
  svg.append('text')
    .attr('x', margin.left)
    .attr('y', 28)
    .attr('font-size', '21px')
    .attr('font-weight', '600')
    .attr('fill', '#111827')
    .text('Patient Discharge Risk Trend');
  
  // Risk color function
  const getRiskColor = (score) => {
    if (score < 0.5) return '#22C55E'; // Low risk - Green
    if (score < 1.5) return '#F59E0B'; // Medium risk - Orange
    return '#EF4444'; // High risk - Red
  };
  
  // Scales
  const x = d3.scaleLinear()
    .domain([0, d3.max(riskData, d => d.dayNumber)])
    .range([0, chartWidth]);
  
  const y = d3.scaleLinear()
    .domain([0, 3])
    .range([chartHeight, 0]);
  
  // Grid
  g.append('g')
    .attr('class', 'grid')
    .attr('opacity', 0.1)
    .call(d3.axisLeft(y).tickSize(-chartWidth).tickFormat(''));
  
  // Line segments with colors
  for (let i = 0; i < riskData.length - 1; i++) {
    const segment = [riskData[i], riskData[i + 1]];
    const segmentColor = getRiskColor(riskData[i].riskScore);
    
    const line = d3.line()
      .x(d => x(d.dayNumber))
      .y(d => y(d.riskScore));
    
    g.append('path')
      .datum(segment)
      .attr('fill', 'none')
      .attr('stroke', segmentColor)
      .attr('stroke-width', 2.5)
      .attr('d', line);
  }
  
  // Create tooltip
  const tooltip = d3.select('body')
    .select('.risk-trend-tooltip')
    .node() ? d3.select('body').select('.risk-trend-tooltip') :
    d3.select('body')
      .append('div')
      .attr('class', 'risk-trend-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', 'rgba(0,0,0,0.85)')
      .style('color', '#fff')
      .style('padding', '10px 14px')
      .style('border-radius', '6px')
      .style('font-size', '18px')
      .style('opacity', 0)
      .style('z-index', '1000');
  
  // Points with tooltips
  g.selectAll('.dot')
    .data(riskData)
    .join('circle')
    .attr('class', 'dot')
    .attr('cx', d => x(d.dayNumber))
    .attr('cy', d => y(d.riskScore))
    .attr('r', 4)
    .attr('fill', d => getRiskColor(d.riskScore))
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .on('pointerenter', function(event, d) {
      d3.select(this).attr('r', 6);
      const riskLevel = d.riskScore < 0.5 ? 'Low Risk' :
                       d.riskScore < 1.5 ? 'Medium Risk' : 'High Risk';
      
      // Calculate date from day number (approximate)
      const admissionDate = patientData.basic.admitDate;
      const dateStr = admissionDate || `Day ${d.dayNumber}`;
      
      tooltip.style('opacity', 1)
        .html(`
          <div style="font-weight:600;margin-bottom:6px;font-size:19px;">${dateStr} (Day ${d.dayNumber})</div>
          <div style="margin-bottom:4px;">
            <span style="color:${getRiskColor(d.riskScore)};">●</span>
            <strong>Risk Score:</strong> ${d.riskScore.toFixed(2)} (${riskLevel})
          </div>
        `)
        .style('left', (event.clientX + 15) + 'px')
        .style('top', (event.clientY - 80) + 'px');
    })
    .on('pointermove', function(event) {
      tooltip
        .style('left', (event.clientX + 15) + 'px')
        .style('top', (event.clientY - 80) + 'px');
    })
    .on('pointerleave', function() {
      d3.select(this).attr('r', 4);
      tooltip.style('opacity', 0);
    });
  
  // Axes
  g.append('g')
    .attr('transform', `translate(0,${chartHeight})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll('text')
    .attr('fill', '#6B7280');
  
  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text')
    .attr('fill', '#6B7280');
  
  // Axis labels
  g.append('text')
    .attr('x', chartWidth / 2)
    .attr('y', chartHeight + 40)
    .attr('text-anchor', 'middle')
    .attr('font-size', '17px')
    .attr('fill', '#6B7280')
    .text('Day');
  
  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -chartHeight / 2)
    .attr('y', -45)
    .attr('text-anchor', 'middle')
    .attr('font-size', '17px')
    .attr('fill', '#6B7280')
    .text('Risk Score');
  
  // Legend - just show Low/Medium/High Risk without numbers
  const legendData = [
    { label: 'Low Risk', color: '#22C55E' },
    { label: 'Medium Risk', color: '#F59E0B' },
    { label: 'High Risk', color: '#EF4444' }
  ];
  
  const legend = svg.append('g')
    .attr('transform', `translate(${width - 90}, ${margin.top - 10})`);
  
  legendData.forEach((item, i) => {
    const ly = i * 20;
    
    legend.append('rect')
      .attr('x', 0)
      .attr('y', ly)
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', item.color);
    
    legend.append('text')
      .attr('x', 18)
      .attr('y', ly + 10)
      .attr('font-size', '16px')
      .attr('fill', '#111827')
      .text(item.label);
  });
}

function renderRadarChart() {
  const container = document.getElementById('readiness-radar-container');
  if (!container) return;
  container.innerHTML = '';
  
  const readinessData = patientData.readiness;
  if (!readinessData || readinessData.length === 0) return;
  
  const margin = { top: 90, right: 30, bottom: 30, left: 30 };
  
  // Get container dimensions with validation
  let width = container.clientWidth || container.offsetWidth || 400;
  let height = container.clientHeight || container.offsetHeight || 400;
  
  // Ensure minimum dimensions
  width = Math.max(width, 300);
  height = Math.max(height, 300);
  
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // Validate chart dimensions
  if (chartWidth <= 0 || chartHeight <= 0) {
    console.error('Invalid radar chart dimensions:', { width, height, chartWidth, chartHeight });
    return;
  }
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  // Expand the radar chart to 85% of available space
  const radius = Math.min(chartWidth, chartHeight) / 2 * 0.85;
  
  // Validate radius
  if (radius <= 0) {
    console.error('Invalid radar chart radius:', radius);
    return;
  }
  
  // Title
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', 28)
    .attr('text-anchor', 'middle')
    .attr('font-size', '21px')
    .attr('font-weight', '600')
    .attr('fill', '#111827')
    .text('Readiness Radar Chart');
  
  const centerX = width / 2;
  const centerY = height / 2;
  // Use the radius already calculated above
  
  const categories = readinessData.map(d => d.category);
  const angleSlice = (Math.PI * 2) / categories.length;
  
  const rScale = d3.scaleLinear()
    .domain([0, 3])
    .range([0, radius]);
  
  const g = svg.append('g')
    .attr('transform', `translate(${centerX}, ${centerY})`);
  
  // Concentric circles
  [1, 2, 3].forEach(level => {
    g.append('circle')
      .attr('r', rScale(level))
      .attr('fill', 'none')
      .attr('stroke', '#E5E7EB')
      .attr('stroke-width', 1);
    
    g.append('text')
      .attr('y', -rScale(level))
      .attr('dy', '-0.3em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '15px')
      .attr('fill', '#9CA3AF')
      .text(level);
  });
  
  // Create tooltip
  const radarTooltip = d3.select('body')
    .select('.radar-tooltip')
    .node() ? d3.select('body').select('.radar-tooltip') :
    d3.select('body')
      .append('div')
      .attr('class', 'radar-tooltip')
      .style('opacity', 0)
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('z-index', 10001);
  
  // Helper function for domain descriptions
  function getDomainDescription(category) {
    const descriptions = {
      'Mobility': "Patient's ability to move, transfer, and ambulate independently",
      'Wound Care': "Status of wounds, healing progress, and infection control",
      'Medical Stability': "Overall medical condition stability and vital signs",
      'Swallowing': "Ability to swallow safely without aspiration risk",
      'Education': "Patient and caregiver education on care management",
      'Social Support': "Availability of caregivers and support systems"
    };
    return descriptions[category] || "Readiness assessment domain";
  }
  
  // Axes
  categories.forEach((cat, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    g.append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', x)
      .attr('y2', y)
      .attr('stroke', '#E5E7EB')
      .attr('stroke-width', 1);
    
    // Labels with tooltips
    const labelRadius = radius + 30;
    const labelX = Math.cos(angle) * labelRadius;
    const labelY = Math.sin(angle) * labelRadius;
    
    const labelText = g.append('text')
      .attr('x', labelX)
      .attr('y', labelY)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '17px')
      .attr('font-weight', '600')
      .attr('fill', '#111827')
      .attr('cursor', 'pointer')
      .text(cat);
    
    // Add hover to labels
    labelText
      .on('mouseover', function(event) {
        d3.select(this).attr('fill', '#2563EB');
        const currentData = readinessData[i];
        const avgValue = currentData ? (
          (currentData.Initial || 0) + (currentData.Progress || 0) + (currentData.Final || 0)
        ) / 3 : 0;
        
        radarTooltip
          .html(`
            <div class="tooltip-header">${cat}</div>
            <div class="tooltip-content">
              <div class="tooltip-metric">Average Score: <strong>${avgValue.toFixed(1)}</strong> / 3.0</div>
              <div class="tooltip-desc">${getDomainDescription(cat)}</div>
            </div>
          `)
          .style('left', (event.pageX + 30) + 'px')
          .style('top', (event.pageY - 100) + 'px')
          .transition()
          .duration(200)
          .style('opacity', 1);
      })
      .on('mouseout', function() {
        d3.select(this).attr('fill', '#111827');
        radarTooltip
          .transition()
          .duration(200)
          .style('opacity', 0);
      });
  });
  
  // Score legend
  const scoreLegend = svg.append('g')
    .attr('transform', `translate(${width - 190}, ${margin.top - 45})`);
  
  scoreLegend.append('rect')
    .attr('width', 170)
    .attr('height', 32)
    .attr('rx', 6)
    .attr('fill', '#F9FAFB')
    .attr('stroke', '#E5E7EB')
    .attr('stroke-width', 1);
  
  scoreLegend.append('text')
    .attr('x', 10)
    .attr('y', 13)
    .attr('font-size', '16px')
    .attr('fill', '#6B7280')
    .text('0 = Needs more support');
  
  scoreLegend.append('text')
    .attr('x', 10)
    .attr('y', 24)
    .attr('font-size', '16px')
    .attr('fill', '#6B7280')
    .text('3 = Ready / doing well');
  
  // Data series
  const series = [
    { name: 'Initial', key: 'Initial', color: '#3B82F6', opacity: 0.3 },
    { name: 'Progress', key: 'Progress', color: '#10B981', opacity: 0.3 },
    { name: 'Final', key: 'Final', color: '#8B5CF6', opacity: 0.3 }
  ];
  
  series.forEach(s => {
    const pathData = readinessData.map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const value = d[s.key] || 0;
      const r = rScale(value);
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    });
    
    const lineGenerator = d3.line()
      .x(d => d[0])
      .y(d => d[1]);
    
    g.append('path')
      .datum([...pathData, pathData[0]])
      .attr('d', lineGenerator)
      .attr('fill', s.color)
      .attr('fill-opacity', s.opacity)
      .attr('stroke', s.color)
      .attr('stroke-width', 2);
    
    // Points with tooltips
    pathData.forEach((point, pointIndex) => {
      const category = categories[pointIndex];
      const currentData = readinessData[pointIndex];
      const value = currentData ? (currentData[s.key] || 0) : 0;
      
      const pointCircle = g.append('circle')
        .attr('cx', point[0])
        .attr('cy', point[1])
        .attr('r', 3)
        .attr('fill', s.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer');
      
      // Add hover to points
      pointCircle
        .on('mouseover', function(event) {
          d3.select(this)
            .attr('r', 5)
            .attr('stroke-width', 2);
          
          radarTooltip
            .html(`
              <div class="tooltip-header">${category}</div>
              <div class="tooltip-content">
                <div class="tooltip-metric">Score: <strong>${value.toFixed(1)}</strong> / 3.0</div>
                <div class="tooltip-desc">${getDomainDescription(category)}</div>
                <div class="tooltip-time">${s.name}</div>
              </div>
            `)
            .style('left', (event.pageX + 30) + 'px')
            .style('top', (event.pageY - 100) + 'px')
            .transition()
            .duration(200)
            .style('opacity', 1);
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('r', 3)
            .attr('stroke-width', 1);
          
          radarTooltip
            .transition()
            .duration(200)
            .style('opacity', 0);
        });
    });
  });
  
  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${width / 2 - 120}, ${height - 40})`);
  
  series.forEach((s, i) => {
    const lx = i * 80;
    
    legend.append('rect')
      .attr('x', lx)
      .attr('y', 0)
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', s.color);
    
    legend.append('text')
      .attr('x', lx + 18)
      .attr('y', 10)
      .attr('font-size', '17px')
      .attr('font-weight', '600')
      .attr('fill', '#111827')
      .text(s.name);
  });
}

// ===== NEW DASHBOARD RENDER FUNCTIONS =====

// Render Patient Info in Sidebar
function renderPatientInfoSidebar() {
  const container = document.getElementById('patient-info-container');
  if (!container || !patientData) return;
  
  const data = patientData.basic;
  const uic = data.name ? data.name.match(/\d+/) : ['1070'];
  
  container.innerHTML = `
    <div class="patient-info-row">
      <span class="patient-info-label">Name:</span>
      <span class="patient-info-value">${uic ? uic[0] : '1070'}</span>
    </div>
    <div class="patient-info-row">
      <span class="patient-info-label">Age:</span>
      <span class="patient-info-value">${data.age || '72 Years Old'}</span>
    </div>
    <div class="patient-info-row">
      <span class="patient-info-label">Gender:</span>
      <span class="patient-info-value">${data.gender || 'Male'}</span>
    </div>
    <div class="patient-info-row">
      <span class="patient-info-label">Admit Date:</span>
      <span class="patient-info-value">${data.admitDate || '1/10'}</span>
    </div>
    <div class="patient-info-row">
      <span class="patient-info-label">Discharge Date:</span>
      <span class="patient-info-value">${data.dischargeDate || ''}</span>
    </div>
    <div class="patient-info-row">
      <span class="patient-info-label">Diagnosis:</span>
      <span class="patient-info-value">${data.diagnosis || 'Orthopedics, Phys infer to mechanical fall'}</span>
    </div>
  `;
}

// Render Episode Summary
function renderEpisodeSummary() {
  const container = document.getElementById('episode-summary-container');
  if (!container) return;
  
  // Calculate stats from clinical events
  const events = clinicalEventsData?.events || [];
  const phases = ['Home', 'ER', 'Unit', 'Discharge', 'Post-Discharge'];
  
  // Count events per phase (ignore SW-only events)
  const phaseCounts = {};
  phases.forEach(p => phaseCounts[p] = 0);
  events.forEach(e => {
    const hasVisible = (e.lanes || []).some(d => d && d !== 'SW');
    if (!hasVisible) return;
    if (phaseCounts[e.phase] !== undefined) phaseCounts[e.phase]++;
  });
  
  // Find most active phase
  let mostActivePhase = 'Unit';
  let maxCount = 0;
  Object.entries(phaseCounts).forEach(([phase, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostActivePhase = phase;
    }
  });
  
  // Get unique disciplines (exclude SW from Episode Summary)
  const disciplines = new Set();
  events.forEach(e => {
    (e.lanes || []).forEach(d => {
      if (d && d !== 'SW') disciplines.add(d);
    });
  });
  
  // Calculate inpatient period
  const admitDate = patientData?.basic?.admitDate || '1/10';
  const dischargeDate = patientData?.basic?.dischargeDate || '1/21';
  
  container.innerHTML = `
    <div class="episode-summary-item">
      <span class="episode-summary-icon">📅</span>
      <span class="episode-summary-text">Inpatient Period: <strong>${admitDate} - ${dischargeDate}</strong></span>
    </div>
    <div class="episode-summary-item">
      <span class="episode-summary-icon">👥</span>
      <span class="episode-summary-text">Disciplines Involved:</span>
    </div>
    <div class="discipline-tags">
      ${Array.from(disciplines).map(d => `<span class="discipline-tag ${d.toLowerCase()}">${d}</span>`).join('')}
    </div>
    <div class="episode-summary-item">
      <span class="episode-summary-text">Most Active Phase: <strong>${mostActivePhase}</strong></span>
    </div>
  `;
}

// Render Filters
function renderFilters() {
  const container = document.getElementById('filters-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="filter-group">
      <div class="filter-row">
        <input type="checkbox" id="filter-phase-enabled" checked>
        <label for="filter-phase-enabled">Filter by Phase:</label>
        <select id="filter-phase" onchange="applyFilters()">
          <option value="all">All Phases</option>
          <option value="Home">Home</option>
          <option value="ER">ER</option>
          <option value="Unit">Unit</option>
          <option value="Discharge">Discharge</option>
          <option value="Post-Discharge">Post-Discharge</option>
        </select>
      </div>
    </div>
    
    <div class="filter-group">
      <div class="filter-row">
        <input type="checkbox" id="filter-discipline-enabled" checked>
        <label for="filter-discipline-enabled">Filter by Discipline:</label>
        <select id="filter-discipline" onchange="applyFilters()">
          <option value="all">All Disciplines</option>
          <option value="MD">MD</option>
          <option value="RN">RN</option>
          <option value="PT">PT</option>
          <option value="OT">OT</option>
          <option value="SLP">SLP</option>
        </select>
      </div>
    </div>
  `;
  // Category filters commented out — to re-enable, uncomment the lines below and remove the closing backtick+semicolon above
  // container.innerHTML += `
  //   <div class="filter-group">
  //     <div class="filter-checkboxes">
  //       <div class="filter-checkbox-item">
  //         <input type="checkbox" id="filter-problem" checked onchange="applyFilters()">
  //         <label for="filter-problem"><span class="filter-color-dot" style="background: ${EVIDENCE_PANEL_COLORS.problem};"></span> Problem</label>
  //       </div>
  //       <div class="filter-checkbox-item">
  //         <input type="checkbox" id="filter-treatment" checked onchange="applyFilters()">
  //         <label for="filter-treatment"><span class="filter-color-dot" style="background: ${EVIDENCE_PANEL_COLORS.treatment};"></span> Treatment</label>
  //       </div>
  //       <div class="filter-checkbox-item">
  //         <input type="checkbox" id="filter-test" checked onchange="applyFilters()">
  //         <label for="filter-test"><span class="filter-color-dot" style="background: ${EVIDENCE_PANEL_COLORS.test};"></span> Test</label>
  //       </div>
  //       <div class="filter-checkbox-item">
  //         <input type="checkbox" id="filter-occurrence" checked onchange="applyFilters()">
  //         <label for="filter-occurrence"><span class="filter-color-dot" style="background: ${EVIDENCE_PANEL_COLORS.occurrence};"></span> Occurrence</label>
  //       </div>
  //     </div>
  //   </div>
  // `;
  container.innerHTML += `
    <div class="filter-group" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
      <div class="filter-checkbox-item">
        <input type="checkbox" id="filter-collaboration" onchange="applyFilters()">
        <label for="filter-collaboration">Collaboration Only</label>
      </div>
    </div>
  `;
}

// Apply filters and re-render
function applyFilters() {
  currentFilters.phase = document.getElementById('filter-phase')?.value || 'all';
  currentFilters.discipline = document.getElementById('filter-discipline')?.value || 'all';
  // Category filter reads commented out (checkboxes hidden); defaults remain true in currentFilters initial state
  // currentFilters.categories.problem = document.getElementById('filter-problem')?.checked ?? true;
  // currentFilters.categories.treatment = document.getElementById('filter-treatment')?.checked ?? true;
  // currentFilters.categories.test = document.getElementById('filter-test')?.checked ?? true;
  // currentFilters.categories.occurrence = document.getElementById('filter-occurrence')?.checked ?? true;
  currentFilters.collaborationOnly = document.getElementById('filter-collaboration')?.checked ?? false;
  
  console.log('Filters applied:', currentFilters);
  renderClinicalTimeline();
  renderReadinessMatrix();
  renderEvidenceTrend();
}
window.applyFilters = applyFilters;

// ===== TIMELINE VISUALIZATION (integrated from pointlism.js) =====

// Timeline constants
const TIMELINE_PHASES = ["Home", "ER", "Unit", "Discharge", "Post-Discharge"];
const TIMELINE_PHASE_LABELS = {
  Home: 'Home',
  ER: 'ER',
  Unit: 'Unit',
  Discharge: 'Discharge',
  'Post-Discharge': 'Post-Discharge'
};
function getTimelinePhaseLabel(phase) {
  if (phase === 'Home' || phase === 'home') return 'Preadmission';
  return TIMELINE_PHASE_LABELS[phase] || phase || '';
}

/** Short phase title when column is too narrow (avoids Discharge / Post-Discharge overlap). */
function getPhaseHeaderDisplay(phase, count, widthPx) {
  const label = getTimelinePhaseLabel(phase);
  const n = count ?? 0;
  if (widthPx >= 100) return { line1: `${label} (${n})`, line2: null };
  const shortMap = {
    Preadmission: 'Pre',
    ER: 'ER',
    Unit: 'Unit',
    Discharge: 'Disch',
    'Post-Discharge': 'Post'
  };
  const short = shortMap[label] || label.slice(0, 4);
  if (widthPx >= 52) return { line1: short, line2: `(${n})` };
  return { line1: String(n), line2: null };
}

function appendPhaseHeaders(svg, margin, dayLayout, phaseCounts) {
  if (!dayLayout?.phases?.length) return;
  dayLayout.phases.forEach((p) => {
    const n = phaseCounts[p.phase] ?? 0;
    const { line1, line2 } = getPhaseHeaderDisplay(p.phase, n, p.width);
    const fontPx = Math.max(12, Math.min(16, Math.floor(p.width / Math.max(3.5, (line1.length + 1) * 0.62))));
    const cx = margin.left + p.x0 + p.width / 2;
    const y0 = line2 ? 14 : 20;
    const text = svg.append('text')
      .attr('x', cx)
      .attr('y', y0)
      .attr('text-anchor', 'middle')
      .attr('font-size', `${fontPx}px`)
      .attr('font-weight', '700')
      .attr('fill', '#111827');
    if (line2) {
      text.append('tspan').attr('x', cx).attr('dy', 0).text(line1);
      text.append('tspan').attr('x', cx).attr('dy', fontPx + 1).text(line2);
    } else {
      text.text(line1);
    }
  });
}

const TIMELINE_LANES = ["MD", "RN", "PT", "OT", "SLP"];
/** Shared chart frame so Storyline / Pointillism / Patient Progress match in size. */
const CLINICAL_TIMELINE_MARGIN = { top: 40, right: 155, bottom: 34, left: 70 };

/** Lanes shown on the clinical timeline (SW is never included). */
function getTimelineVisibleLanes(event) {
  return (event?.lanes || []).filter((d) => TIMELINE_LANES.includes(d));
}

function eventHasTimelineVisibleLane(event) {
  return getTimelineVisibleLanes(event).length > 0;
}
// Discipline palette (user-provided mapping)
const DISCIPLINE_COLORS = {
  MD: "#66C2A5",
  RN: "#FC8D62",
  PT: "#8DA0CB",
  OT: "#E78AC3",
  SLP: "#A6D854",
  SW: "#FFD92F"
};

const TIMELINE_DAY_SEQ_PALETTE = ['#fff7fb', '#ece7f2', '#d0d1e6'];

function hexToRgbChannels(hex) {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function rgbChannelsToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Smooth sequential fill from lightest→darkest across stay days (t in 0..1). */
function timelineSequentialDayFill(t) {
  const pal = TIMELINE_DAY_SEQ_PALETTE;
  const x = Math.max(0, Math.min(1, t));
  const n = pal.length - 1;
  const p = x * n;
  const i = Math.min(n - 1, Math.floor(p));
  const f = p - i;
  const a = hexToRgbChannels(pal[i]);
  const b = hexToRgbChannels(pal[i + 1]);
  return rgbChannelsToHex(
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f
  );
}

function timelineDayFillByIndex(index, count) {
  return timelineSequentialDayFill(index / Math.max(1, count - 1));
}

// Current timeline mode
let currentTimelineMode = 'pointillism';

// Current matrix mode
let currentMatrixMode = 'all_patient_summary';

// All Patient Summary state
let allPatientSummaryDataCache = {};
let allPatientSummarySelectedDate = null;

async function fetchPatientSummaryData(patientNum) {
  const cacheKey = `Patient${patientNum}`;
  if (allPatientSummaryDataCache[cacheKey]) return allPatientSummaryDataCache[cacheKey];

  try {
    const response = await fetch(`data/Patient${patientNum}summary.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    if (!Array.isArray(json)) {
      throw new Error('Patient summary JSON must be an array.');
    }

    const normalized = json
      .map(item => ({
        date: item.date,
        day: item.day,
        keyClinicalIssues: item['key clinical issues'] || [],
        careFollowUp: item['Care, function, and follow-up'] || []
      }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    allPatientSummaryDataCache[cacheKey] = normalized;
    return normalized;
  } catch (error) {
    console.error('Error loading patient summary data:', error);
    allPatientSummaryDataCache[cacheKey] = [];
    return [];
  }
}

function formatAllPatientSummaryDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function renderAllPatientSummary(container) {
  container.innerHTML = `
    <div class="all-patient-summary-shell">
      <div class="all-patient-summary-header">
        <div class="all-patient-summary-title">Patient ${currentPatient} summary dates</div>
      </div>
      <div id="all-patient-summary-buttons" class="all-patient-summary-buttons"></div>
      <div class="all-patient-summary-info">
        <div id="all-patient-summary-selected-date" class="all-patient-summary-selected-date">Select one of the dates above</div>
      </div>
      <div id="all-patient-summary-detail" class="all-patient-summary-detail">
        Choose a date to view Key clinical issues / status and Care coordination / follow-up.
      </div>
    </div>
  `;

  const buttonsContainer = container.querySelector('#all-patient-summary-buttons');
  const selectedDateDisplay = container.querySelector('#all-patient-summary-selected-date');
  const detailContainer = container.querySelector('#all-patient-summary-detail');

  if (!buttonsContainer || !selectedDateDisplay || !detailContainer) {
    return;
  }

  allPatientSummarySelectedDate = null;

  fetchPatientSummaryData(currentPatient).then(data => {
    if (!data.length) {
      selectedDateDisplay.textContent = 'No patient summary data found.';
      detailContainer.textContent = 'The patient summary JSON could not be loaded or is empty.';
      return;
    }

    buttonsContainer.innerHTML = data
      .map(item => `<button type="button" class="summary-date-button" data-date="${item.date}">${formatAllPatientSummaryDate(item.date)}</button>`)
      .join('');

    const buttons = Array.from(buttonsContainer.querySelectorAll('.summary-date-button'));

    const updateSelectedDate = (item) => {
      allPatientSummarySelectedDate = item.date;
      buttons.forEach(btn => btn.classList.toggle('summary-date-button--active', btn.dataset.date === item.date));
      selectedDateDisplay.textContent = `${formatAllPatientSummaryDate(item.date)} — Day ${item.day}`;
      detailContainer.innerHTML = `
        <div class="all-patient-summary-section">
          <div class="all-patient-summary-section-title">Key clinical issues / status</div>
          <ul class="all-patient-summary-list">${item.keyClinicalIssues.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>
        </div>
        <div class="all-patient-summary-section">
          <div class="all-patient-summary-section-title">Care coordination / follow-up</div>
          <ul class="all-patient-summary-list">${item.careFollowUp.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>
        </div>
      `;
    };

    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const date = button.dataset.date;
        const item = data.find(row => row.date === date);
        if (item) updateSelectedDate(item);
      });
    });

    if (data.length > 0) {
      updateSelectedDate(data[0]);
    }
  });
}

// Change matrix mode handler
function changeMatrixMode() {
  const select = document.getElementById('matrix-mode-select');
  if (select) {
    let mode = select.value;
    if (mode === 'all_team_summary') {
      mode = 'all_patient_summary';
      select.value = mode;
    }
    currentMatrixMode = mode;
    renderReadinessMatrix();
  }
}
window.changeMatrixMode = changeMatrixMode;

// Change timeline mode handler
function changeTimelineMode() {
  const select = document.getElementById('timeline-mode-select');
  if (select) {
    let v = select.value;
    if (v === 'pie_dots') {
      v = 'storyline';
      select.value = 'storyline';
    }
    currentTimelineMode = v;
    console.log('Timeline mode changed to:', currentTimelineMode);
    renderClinicalTimeline();
  }
}
window.changeTimelineMode = changeTimelineMode;

// Change trend view handler (Daily Trend vs Questions)
async function loadQuestionData() {
  try {
    const primary = await fetch('data/LLM_Questions.json');
    if (primary.ok) {
      return await primary.json();
    }

    const fallback = await fetch('data/questionData.json');
    if (!fallback.ok) {
      throw new Error(`Could not load LLM_Questions.json or questionData.json: ${primary.status}/${fallback.status}`);
    }

    return await fallback.json();
  } catch (error) {
    console.error('Error loading question data:', error);
    return null;
  }
}

function renderQuestionsPanel() {
  const container = document.getElementById('questions-container');
  if (!container) return;

  if (!questionData || !Array.isArray(questionData.professions) || questionData.professions.length === 0) {
    container.innerHTML = '<div style="font-weight:600;margin-bottom:8px;">Questions</div><div style="color:var(--text-muted);">Question data is not available.</div>';
    return;
  }

  const professions = (questionData.professions || []).filter(p => p?.profession !== 'SW');
  if (professions.length === 0) {
    container.innerHTML = '<div style="font-weight:600;margin-bottom:8px;">Questions</div><div style="color:var(--text-muted);">Question data is not available.</div>';
    return;
  }
  const professionOptions = professions
    .map(p => `<option value="${escapeHtml(p.profession)}">${escapeHtml(p.profession)}</option>`)
    .join('');

  const allDates = getDatedQuestionDateKeys();

  if (allDates.length === 0) {
    container.innerHTML = '<div style="font-weight:600;margin-bottom:8px;">Questions</div><div style="color:var(--text-muted);">No dated questions found in LLM_Questions.json.</div>';
    return;
  }

  const selectedDate = allDates[0];
  const initialNoteValue = 'note_1';
  const initialNoteOptions = '<option value="note_1">note_1</option>';

  container.innerHTML = `
    <div class="questions-panel">
      <div class="questions-row">
        <label for="question-profession-select">Choose Profession:</label>
        <select id="question-profession-select" class="question-select">${professionOptions}</select>
      </div>
      <div class="questions-date-slider-wrap">
        <input
          id="question-date-slider"
          class="question-date-slider"
          type="range"
          min="0"
          max="${Math.max(0, allDates.length - 1)}"
          step="1"
          value="0"
          aria-label="Question date"
        >
        <div id="question-date-labels" class="question-date-labels">${allDates.map((d, i) => `<span class="question-date-label${i === 0 ? ' question-date-label--active' : ''}">${escapeHtml(d)}</span>`).join('')}</div>
      </div>
      <div id="question-answer-output" class="question-answer-output"></div>
    </div>
  `;

  const professionSelect = document.getElementById('question-profession-select');
  const dateSlider = document.getElementById('question-date-slider');
  const dateLabels = Array.from(container.querySelectorAll('.question-date-label'));
  const answerOutput = document.getElementById('question-answer-output');
  let activeDate = selectedDate;

  function getNotesForSelection() {
    const professionValue = professionSelect?.value;
    const professionItem = professions.find(p => p.profession === professionValue) || professions[0] || { notes: [] };
    return (professionItem.notes || []).filter(n => n.date === activeDate);
  }

  function findQuestionsWithFallback() {
    const professionValue = professionSelect?.value;
    const professionItem = professions.find(p => p.profession === professionValue) || professions[0] || { notes: [] };
    const notes = Array.isArray(professionItem.notes) ? professionItem.notes : [];

    const dateIndex = allDates.indexOf(activeDate);
    for (let idx = dateIndex; idx >= 0; idx--) {
      const dateToTry = allDates[idx];
      const notesForDate = notes.filter(n => n.date === dateToTry);
      const noteItem = notesForDate.find(n => n.note === 'note_1') || notesForDate[0] || null;
      const questions = Array.isArray(noteItem?.questions) ? noteItem.questions : [];
      if (questions.length > 0) {
        return { questions, sourceDate: dateToTry };
      }
    }

    return { questions: [], sourceDate: null };
  }

  function updateDateLabels(activeIndex) {
    dateLabels.forEach((label, idx) => {
      label.classList.toggle('question-date-label--active', idx === activeIndex);
    });
  }

  function renderQuestionsAndAnswers() {
    if (!answerOutput) return;

    const fallback = findQuestionsWithFallback();
    const questions = fallback.questions;

    if (!questions.length) {
      answerOutput.innerHTML = '<div class="question-answer-text">No questions available for this profession and date history.</div>';
      return;
    }

    const fallbackNotice = (fallback.sourceDate && fallback.sourceDate !== activeDate)
      ? `<div class="question-answer-text question-fallback-notice">No new Question for this date. Showing Q/A from ${escapeHtml(fallback.sourceDate)} (nearest previous date with data).</div>`
      : '';

    answerOutput.innerHTML = fallbackNotice + questions.map((qa, index) => {
      const q = escapeHtml(qa?.question || '');
      const a = escapeHtml(qa?.answer || 'No answer available.');
      const status = getQaStatusMeta(qa, fallback.sourceDate || activeDate);
      return `
        <div class="qa-item">
          <div class="qa-question">Q${index + 1}. ${q}<span class="qa-status-dot qa-status-dot--${status.tone}" title="Question status: ${status.label}" aria-label="Question status: ${status.label}"></span></div>
          <div class="qa-answer">A. ${a}</div>
        </div>
      `;
    }).join('');
  }

  if (professionSelect) {
    professionSelect.addEventListener('change', () => {
      renderQuestionsAndAnswers();
      if (answerOutput) answerOutput.scrollTop = 0;
    });
  }

  if (dateSlider) {
    const handleDateChange = () => {
      const idx = Number(dateSlider.value) || 0;
      activeDate = allDates[idx] || allDates[0];
      updateDateLabels(idx);
      renderQuestionsAndAnswers();
      if (answerOutput) answerOutput.scrollTop = 0;
    };
    dateSlider.addEventListener('input', handleDateChange);
    dateSlider.addEventListener('change', handleDateChange);

    dateLabels.forEach((label, idx) => {
      label.addEventListener('click', () => {
        dateSlider.value = String(idx);
        handleDateChange();
      });
    });
  }

  renderQuestionsAndAnswers();
}

function changeTrendView() {
  const select = document.getElementById('trend-view-select');
  if (!select) return;
  const mode = select.value;
  const trendContainer = document.getElementById('evidence-trend-container');
  const questionsContainer = document.getElementById('questions-container');

  const titleEl = document.getElementById('trend-section-title');
  if (mode === 'daily') {
    if (titleEl) titleEl.textContent = 'Daily Clinical Evidence Trend';
    if (questionsContainer) questionsContainer.style.display = 'none';
    if (trendContainer) {
      trendContainer.style.display = 'flex';
      try { renderEvidenceTrend(); } catch (e) { console.error('Error rendering evidence trend:', e); }
    }
  } else if (mode === 'questions') {
    if (titleEl) titleEl.textContent = 'Questions';
    if (trendContainer) trendContainer.style.display = 'none';
    if (questionsContainer) {
      questionsContainer.style.display = 'block';
      renderQuestionsPanel();
    }
  }
}
window.changeTrendView = changeTrendView;

/** Per-stage counts for timeline headers (exclude SW-only events; SW never counted). */
function getClinicalTimelinePhaseCounts(events) {
  const byPhase = Object.fromEntries(TIMELINE_PHASES.map(p => [p, 0]));
  for (const e of events || []) {
    if (!eventHasTimelineVisibleLane(e)) continue;
    const ph = e.phase || 'Unit';
    if (Object.prototype.hasOwnProperty.call(byPhase, ph)) byPhase[ph]++;
  }
  return byPhase;
}

function updateClinicalTimelineTitle(filteredEvents) {
  const el = document.getElementById('clinical-timeline-total-count');
  if (!el) return;
  const n = (filteredEvents || []).filter(eventHasTimelineVisibleLane).length;
  el.textContent = ` (${n})`;
}

// Render Clinical Event Timeline - Supports 3 modes
function renderClinicalTimeline() {
  const container = document.getElementById('clinical-timeline-container');
  if (!container) {
    console.error('Clinical timeline container not found');
    return;
  }
  
  const events = clinicalEventsData?.events || [];
  if (events.length === 0) {
    container.innerHTML = '<p style="color: #888; padding: 20px;">No clinical events to display.</p>';
    updateClinicalTimelineTitle([]);
    return;
  }
  
  const filteredEvents = applySidebarFiltersToEvents(events);

  updateClinicalTimelineTitle(filteredEvents);
  
  // Clear container
  container.innerHTML = '';
  
  // Render based on current mode
  switch (currentTimelineMode) {
    case 'pointillism':
      renderPointillismTimeline(container, filteredEvents);
      break;
    case 'patient_progress_timeline':
      renderPatientProgressTimeline(container, filteredEvents);
      break;
    case 'storyline':
    default:
      renderStorylineTimeline(container, filteredEvents);
      break;
  }
}

// ===== STORYLINE MODE =====
function renderStorylineTimeline(container, filteredEvents) {
  const phaseCounts = getClinicalTimelinePhaseCounts(filteredEvents);
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 300;
  
  const margin = { ...CLINICAL_TIMELINE_MARGIN };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Calculate lane positions
  const laneHeight = chartHeight / TIMELINE_LANES.length;
  const laneY = {};
  TIMELINE_LANES.forEach((lane, i) => {
    laneY[lane] = (i + 0.5) * laneHeight;
  });
  
  const { admit, discharge } = getPatientStayDates();
  const dayLayout = (admit && discharge) ? buildEqualDayLayout(admit, discharge, chartWidth) : null;
  if (!dayLayout) {
    container.innerHTML = '<p style="color:#888;padding:20px;">Admit/discharge dates are required for the timeline.</p>';
    return;
  }

  appendSequentialDayBands(g, dayLayout, admit, discharge, chartHeight);
  appendVerticalDayGuides(g, dayLayout, chartHeight);

  // Discipline labels on left (same style as Pointillism / Patient Progress)
  TIMELINE_LANES.forEach((lane, i) => {
    const y = i * laneHeight;

    svg.append('text')
      .attr('x', margin.left - 10)
      .attr('y', margin.top + laneY[lane])
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .attr('fill', DISCIPLINE_COLORS[lane] || '#333')
      .text(lane);
    
    if (i < TIMELINE_LANES.length - 1) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', chartWidth)
        .attr('y1', y + laneHeight)
        .attr('y2', y + laneHeight)
        .attr('stroke', '#e0e0e0')
        .attr('stroke-width', 1);
    }
  });

  appendPhaseHeaders(svg, margin, dayLayout, phaseCounts);
  
  // Draw events at JSON report date, spread within that day's pixel slot
  const eventXByEvent = assignSpreadXByDay(filteredEvents, dayLayout, admit, discharge);
  filteredEvents.forEach((event) => {
    const disciplines = event.lanes || [];
    if (disciplines.length === 0) return;

    const eventX = eventXByEvent.get(event);
    if (eventX == null) return;
    
    const validDisciplines = disciplines.filter(d => TIMELINE_LANES.includes(d));
    if (validDisciplines.length === 0) return;
    
    if (validDisciplines.length > 1) {
      const sortedDisciplines = validDisciplines.slice().sort(
        (a, b) => TIMELINE_LANES.indexOf(a) - TIMELINE_LANES.indexOf(b)
      );
      const topY = laneY[sortedDisciplines[0]];
      const bottomY = laneY[sortedDisciplines[sortedDisciplines.length - 1]];
      
      g.append('line')
        .attr('x1', eventX)
        .attr('x2', eventX)
        .attr('y1', topY)
        .attr('y2', bottomY)
        .attr('stroke', '#666')
        .attr('stroke-width', 2)
        .attr('opacity', 0.6);
    }
    
    validDisciplines.forEach(discipline => {
      const y = laneY[discipline];
      const color = DISCIPLINE_COLORS[discipline] || '#999';
      
      const circle = g.append('circle')
        .attr('cx', eventX)
        .attr('cy', y)
        .attr('r', 8)
        .attr('fill', color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .attr('opacity', 0.9)
        .style('cursor', 'pointer');
      
      circle.on('mouseenter', function(e) {
        d3.select(this).attr('r', 11).attr('stroke-width', 3);
        showEventTooltip(event, e || window.event);
      });
      
      circle.on('mouseleave', function() {
        d3.select(this).attr('r', 8).attr('stroke-width', 2);
        hideEventTooltip();
      });
      
      circle.on('click', function() {
        showEventDetails(event);
      });
    });
    
    if (validDisciplines.length > 1) {
      const sortedDisciplines = validDisciplines.slice().sort(
        (a, b) => TIMELINE_LANES.indexOf(a) - TIMELINE_LANES.indexOf(b)
      );
      const midY = (laneY[sortedDisciplines[0]] + laneY[sortedDisciplines[sortedDisciplines.length - 1]]) / 2;
      const size = 4;
      g.append('polygon')
        .attr('points', `${eventX},${midY - size} ${eventX + size},${midY} ${eventX},${midY + size} ${eventX - size},${midY}`)
        .attr('fill', '#333')
        .attr('opacity', 0.7);
    }
  });
  
  // Date labels under each equal-width day column
  appendDayAxisLabels(g, dayLayout, chartHeight);

  g.append('text')
    .attr('x', chartWidth / 2)
    .attr('y', chartHeight + 26)
    .attr('text-anchor', 'middle')
    .attr('font-size', '16px')
    .text('Date');
  
  // Legend
  drawTimelineLegend(svg, margin, chartWidth, 'storyline');
}

// ===== POINTILLISM MODE (Ribbons with dots) =====
// Constants from original pointlism.js
// Y positions for MD, RN, PT, OT, SLP — bottom lanes spaced wider so they don’t stack
const BASE_YS = [4.3, 3.75, 2.82, 2.28, 1.82];
const PULL_STRENGTH = 0.55;
const N_SPLINE = 100;

// Catmull-Rom spline interpolation
function catmullRomSpline(P, nPoints = 80) {
  if (P.length < 2) return P;
  const pts = [[P[0][0], P[0][1]], ...P, [P[P.length - 1][0], P[P.length - 1][1]]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let t = 0; t < 1; t += 1 / (nPoints / (pts.length - 3))) {
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  out.push([P[P.length - 1][0], P[P.length - 1][1]]);
  return out;
}

// ----- Patient Progress Timeline (Q&A-based RYG colors + popup) -----
const PATIENT_PROGRESS_GREEN_RE = /\b(stable|clear|resolved|improved)\b/i;
const PATIENT_PROGRESS_EARLY_UNIT_FRAC = 0.36;
const QA_TONE_COLORS = {
  red: '#dc2626',
  yellow: '#ca8a04',
  green: '#16a34a'
};

function parsePatientDashboardDate(mdy) {
  if (!mdy) return null;
  const parts = String(mdy).trim().split('/').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return new Date(2022, parts[0] - 1, parts[1]);
}

function snippetHasProgressGreenKeywords(text) {
  return !!(text && PATIENT_PROGRESS_GREEN_RE.test(text));
}

/** 0..1 along admission→discharge; uses first origin note date when present. */
function getEventProgressFractionForPatientView(event, admitD, dischargeD) {
  if (!admitD || !dischargeD) return null;
  let t;
  if (event.origin_notes && event.origin_notes[0] && event.origin_notes[0].date) {
    t = parseClinicalNoteDateString(event.origin_notes[0].date);
  }
  if (!t) {
    const phaseFrac = { Home: 0.04, ER: 0.1, Unit: 0.45, Discharge: 0.86, "Post-Discharge": 0.94 };
    const f = phaseFrac[event.phase] != null ? phaseFrac[event.phase] : 0.5;
    const los = Math.max(dischargeD.getTime() - admitD.getTime(), 86400000);
    t = new Date(admitD.getTime() + f * los);
  }
  t.setHours(0, 0, 0, 0);
  const a = new Date(admitD);
  a.setHours(0, 0, 0, 0);
  const d = new Date(dischargeD);
  d.setHours(0, 0, 0, 0);
  const los = Math.max(d - a, 86400000);
  return Math.max(0, Math.min(1, (t - a) / los));
}

function parseQuestionMonthDay(dateStr) {
  if (!dateStr) return { month: 0, day: 0 };
  const [month, day] = String(dateStr).split('/').map(Number);
  return { month: Number.isFinite(month) ? month : 0, day: Number.isFinite(day) ? day : 0 };
}

function compareQuestionDateKeys(a, b) {
  const da = parseQuestionMonthDay(a);
  const db = parseQuestionMonthDay(b);
  if (da.month !== db.month) return da.month - db.month;
  return da.day - db.day;
}

/** Convert ISO / Date / m/d[/y] into LLM_Questions key like "1/11". */
function toQuestionDateKey(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getMonth() + 1}/${raw.getDate()}`;
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${parseInt(iso[2], 10)}/${parseInt(iso[3], 10)}`;
  }
  const md = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/);
  if (md) {
    return `${parseInt(md[1], 10)}/${parseInt(md[2], 10)}`;
  }
  return null;
}

function getEventQuestionDateKey(event) {
  const raw = event?.origin_notes && event.origin_notes[0] && event.origin_notes[0].date;
  const fromNote = toQuestionDateKey(raw);
  if (fromNote) return fromNote;

  const admitD = parsePatientDashboardDate(patientData?.basic?.admitDate)
    || parseDateFromText(patientData?.basic?.admitDate);
  const dischargeD = parsePatientDashboardDate(patientData?.basic?.dischargeDate)
    || parseDateFromText(patientData?.basic?.dischargeDate);
  if (!admitD) return null;

  const dayMs = 86400000;
  const phaseOffsetDays = {
    Home: -1,
    ER: 0,
    Unit: 2,
    Discharge: dischargeD ? Math.round((startOfLocalDay(dischargeD) - startOfLocalDay(admitD)) / dayMs) : 8,
    'Post-Discharge': dischargeD ? Math.round((startOfLocalDay(dischargeD) - startOfLocalDay(admitD)) / dayMs) + 1 : 9
  };
  const offset = phaseOffsetDays[event?.phase];
  if (offset == null || Number.isNaN(offset)) return null;
  const approx = new Date(startOfLocalDay(admitD).getTime() + offset * dayMs);
  return toQuestionDateKey(approx);
}

function getAllQuestionDateKeys() {
  if (!questionData || !Array.isArray(questionData.professions)) return [];
  return Array.from(new Set(
    questionData.professions.flatMap(p =>
      Array.isArray(p.notes) ? p.notes.map(n => n.date).filter(Boolean) : []
    )
  )).sort(compareQuestionDateKeys);
}

function getDatedQuestionDateKeys() {
  if (!questionData || !Array.isArray(questionData.professions)) return [];
  return Array.from(new Set(
    questionData.professions.flatMap(p =>
      (Array.isArray(p.notes) ? p.notes : [])
        .filter(n => Array.isArray(n.questions) && n.questions.length > 0)
        .map(n => n.date)
        .filter(Boolean)
    )
  )).sort(compareQuestionDateKeys);
}

/**
 * Shared R/Y/G status from question+answer text (also used by Questions panel).
 * Tone is driven primarily by answer/question wording, with date progress as tie-breaker.
 */
function getQaStatusMeta(qa, sourceDate) {
  const text = `${qa?.question || ''} ${qa?.answer || ''}`.toLowerCase();
  const answerOnly = String(qa?.answer || '').toLowerCase();
  const highRiskRe = /\b(high\s*risk|fall\s*risk|unsafe|not\s+yet|persistent|unresolved|abnormal|delay|barrier|weakness|injury|fracture|hypoxia|withdrawal)\b/i;
  const greenSignalRe = /\b(stable|clear|resolved|improved|readiness|ready|tolerating|tolerance|closer\s+to\s+baseline|safer|progress|improving)\b/i;

  const datedQuestionDates = getDatedQuestionDateKeys();
  const idx = datedQuestionDates.indexOf(sourceDate);
  const denom = Math.max(1, datedQuestionDates.length - 1);
  const progressFrac = idx >= 0 ? (idx / denom) : 0.5;

  // Prefer answer text when deciding color.
  if (greenSignalRe.test(answerOnly) || (greenSignalRe.test(text) && progressFrac >= 0.5)) {
    return { tone: 'green', label: 'improving/readiness', color: QA_TONE_COLORS.green };
  }
  if (highRiskRe.test(answerOnly) || (highRiskRe.test(text) && progressFrac < 0.5)) {
    return { tone: 'red', label: 'acute risk/concern', color: QA_TONE_COLORS.red };
  }
  if (progressFrac < 0.34) {
    return { tone: 'red', label: 'early/acute phase', color: QA_TONE_COLORS.red };
  }
  if (progressFrac >= 0.8) {
    return { tone: 'green', label: 'late improving phase', color: QA_TONE_COLORS.green };
  }
  return { tone: 'yellow', label: 'monitoring/progressing', color: QA_TONE_COLORS.yellow };
}

function aggregateQaToneFromQuestions(questions, sourceDate) {
  if (!questions || !questions.length) {
    return { tone: 'yellow', label: 'no Q/A', color: QA_TONE_COLORS.yellow };
  }
  const metas = questions.map(qa => getQaStatusMeta(qa, sourceDate));
  if (metas.some(m => m.tone === 'red')) {
    return { tone: 'red', label: 'acute risk/concern', color: QA_TONE_COLORS.red };
  }
  if (metas.some(m => m.tone === 'yellow')) {
    return { tone: 'yellow', label: 'monitoring/progressing', color: QA_TONE_COLORS.yellow };
  }
  return { tone: 'green', label: 'improving/readiness', color: QA_TONE_COLORS.green };
}

/** Find Q/A for this profession + event date only (no fallback to another date). */
function findQuestionsForProfessionAndEvent(profession, event) {
  const empty = { questions: [], sourceDate: null, requestedDate: null, profession: profession || null };
  if (!questionData || !Array.isArray(questionData.professions) || !profession) return empty;

  const professionItem = questionData.professions.find(p => p.profession === profession);
  if (!professionItem) return empty;

  const requestedDate = getEventQuestionDateKey(event);
  if (!requestedDate) return { ...empty, requestedDate };

  const notes = Array.isArray(professionItem.notes) ? professionItem.notes : [];
  const notesForDate = notes.filter(n => n.date === requestedDate);
  const noteItem = notesForDate.find(n => n.note === 'note_1') || notesForDate[0] || null;
  const questions = Array.isArray(noteItem?.questions) ? noteItem.questions : [];
  if (questions.length > 0) {
    return {
      questions,
      sourceDate: requestedDate,
      requestedDate,
      profession,
      noteId: noteItem?.note || null
    };
  }

  return { ...empty, requestedDate };
}

/** Fallback phase/snippet coloring when no Q/A is available for this dot. */
function getPatientProgressDotColorFallback(event) {
  const snippet = event.snippet || '';
  if (snippetHasProgressGreenKeywords(snippet)) return QA_TONE_COLORS.green;

  const admitD = parsePatientDashboardDate(patientData?.basic?.admitDate);
  const dischargeD = parsePatientDashboardDate(patientData?.basic?.dischargeDate);
  const phase = event.phase;

  if (phase === 'Home' || phase === 'ER') return QA_TONE_COLORS.red;

  if (phase === 'Unit') {
    const frac = getEventProgressFractionForPatientView(event, admitD, dischargeD);
    if (frac != null && frac < PATIENT_PROGRESS_EARLY_UNIT_FRAC) return QA_TONE_COLORS.red;
    return QA_TONE_COLORS.yellow;
  }

  return QA_TONE_COLORS.yellow;
}

/**
 * Patient Progress dot color from LLM answer status for this discipline/date.
 * Uses worst tone across the Q/A set (red > yellow > green).
 */
function getQaImproveCounts(event, profession) {
  const found = findQuestionsForProfessionAndEvent(profession, event);
  const questions = found.questions || [];
  if (!questions.length) {
    return { green: 0, red: 0, yellow: 0, total: 0, hasQa: false, found };
  }
  let green = 0;
  let red = 0;
  let yellow = 0;
  questions.forEach((qa) => {
    const tone = getQaStatusMeta(qa, found.sourceDate).tone;
    if (tone === 'green') green += 1;
    else if (tone === 'red') red += 1;
    else yellow += 1;
  });
  return { green, red, yellow, total: questions.length, hasQa: true, found };
}

/**
 * Vertical placement inside a discipline row (0 = lowest / ribbon, 1 = top of row).
 * 3 Improving → top third; 2 Improving → middle; 1 Improving → bottom third;
 * all red → lowest; Q/A missing or monitoring → middle.
 */
function getPatientProgressHeightFrac(event, profession) {
  const c = getQaImproveCounts(event, profession);
  if (!c.hasQa) return 0.5;
  if (c.total > 0 && c.red === c.total) return 0.08;
  if (c.green >= 3) return 0.82;
  if (c.green === 2) return 0.5;
  if (c.green === 1) return 0.28;
  return 0.5;
}

function getPatientProgressDotColor(event, profession) {
  const lane = profession || (event.lanes && event.lanes[0]) || null;
  const found = findQuestionsForProfessionAndEvent(lane, event);
  if (found.questions && found.questions.length) {
    return aggregateQaToneFromQuestions(found.questions, found.sourceDate).color;
  }
  return getPatientProgressDotColorFallback(event);
}

/** Total character length of Q/A answers for this discipline + event date. */
function getPatientProgressAnswerTextLength(event, profession) {
  const found = findQuestionsForProfessionAndEvent(profession, event);
  if (!found.questions || !found.questions.length) return 0;
  return found.questions.reduce((sum, qa) => sum + String(qa?.answer || '').length, 0);
}

/** Patient Progress circle radius from answer text length (not clinical-note length). */
function getPatientProgressDotRadius(event, profession) {
  const answerLen = getPatientProgressAnswerTextLength(event, profession);
  if (answerLen <= 0) return 3.5;
  if (answerLen <= 200) return 3.2 + (answerLen / 200) * (5 - 3.2);
  if (answerLen <= 225) return 5 + ((answerLen - 200) / 25) * (6.5 - 5);
  if (answerLen <= 450) return 6.5 + ((answerLen - 225) / 225) * (8 - 6.5);
  return 8;
}

function appendPatientProgressPieDot(parent, cx, cy, radius, event, profession) {
  const counts = getQaImproveCounts(event, profession);
  const wrap = parent.append('g')
    .attr('class', 'pointillism-dot-visible')
    .attr('pointer-events', 'none')
    .attr('transform', `translate(${cx},${cy})`);
  const stroke = counts.hasQa ? '#111827' : '#555';
  const strokeW = counts.hasQa ? 1.15 : 0.85;

  const drawSolid = (fill) => {
    wrap.append('circle')
      .attr('r', radius)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', strokeW)
      .attr('opacity', 0.92);
  };

  if (!counts.hasQa) {
    drawSolid(getPatientProgressDotColorFallback(event));
    return wrap;
  }

  const parts = [
    { n: counts.red, color: QA_TONE_COLORS.red },
    { n: counts.yellow, color: QA_TONE_COLORS.yellow },
    { n: counts.green, color: QA_TONE_COLORS.green }
  ].filter(p => p.n > 0);
  const total = counts.total || parts.reduce((sum, p) => sum + p.n, 0);

  if (parts.length <= 1 || total < 1) {
    drawSolid(parts[0] ? parts[0].color : QA_TONE_COLORS.yellow);
    return wrap;
  }

  let angle = 0;
  parts.forEach((p) => {
    const sweep = (p.n / total) * Math.PI * 2;
    const a0 = angle - Math.PI / 2;
    const a1 = angle + sweep - Math.PI / 2;
    const x0 = radius * Math.cos(a0);
    const y0 = radius * Math.sin(a0);
    const x1 = radius * Math.cos(a1);
    const y1 = radius * Math.sin(a1);
    const large = sweep > Math.PI ? 1 : 0;
    wrap.append('path')
      .attr('d', `M 0 0 L ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1} Z`)
      .attr('fill', p.color)
      .attr('opacity', 0.92);
    angle += sweep;
  });
  wrap.append('circle')
    .attr('r', radius)
    .attr('fill', 'none')
    .attr('stroke', stroke)
    .attr('stroke-width', strokeW);
  return wrap;
}

/** Popup body: Question & Answer list for Patient Progress Timeline clicks. */
function showEventQaDetails(event, profession) {
  const lane = profession || (event.lanes && event.lanes[0]) || '—';
  const found = findQuestionsForProfessionAndEvent(lane, event);
  const phaseLabel = getTimelinePhaseLabel(event.phase);
  const aggregate = found.questions.length
    ? aggregateQaToneFromQuestions(found.questions, found.sourceDate)
    : { tone: 'yellow', label: 'no Q/A available', color: QA_TONE_COLORS.yellow };

  let bodyHtml = '';
  if (!found.questions.length) {
    bodyHtml = `<p class="popup-body-empty">No Q/A</p>`;
  } else {
    const fallbackNotice = `<div class="popup-qa-notice">Q/A date: ${escapeHtml(found.sourceDate || found.requestedDate || '—')} · Status: ${escapeHtml(aggregate.label)}</div>`;

    bodyHtml = fallbackNotice + found.questions.map((qa, index) => {
      const status = getQaStatusMeta(qa, found.sourceDate);
      const q = escapeHtml(qa?.question || '');
      const a = escapeHtml(qa?.answer || 'No answer available.');
      return `
        <div class="qa-item popup-qa-item">
          <div class="qa-question">Q${index + 1}. ${q}<span class="qa-status-dot qa-status-dot--${status.tone}" title="Answer status: ${escapeHtml(status.label)}"></span></div>
          <div class="qa-answer">A. ${a}</div>
        </div>
      `;
    }).join('');
  }

  const existing = document.getElementById('event-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'event-popup';
  popup.innerHTML = `
    <div class="popup-overlay" onclick="closeEventPopup()"></div>
    <div class="popup-content">
      <div class="popup-header">
        <span class="popup-phase">${escapeHtml(phaseLabel)} · ${escapeHtml(lane)}</span>
        <span class="popup-close" onclick="closeEventPopup()">&times;</span>
      </div>
      <div class="popup-disciplines">
        Patient Progress Q&amp;A
        ${found.questions.length
          ? `<span class="popup-qa-tone-badge popup-qa-tone-badge--${aggregate.tone}" title="${escapeHtml(aggregate.label)}"></span>`
          : ''}
      </div>
      <div class="popup-body popup-body--qa">${bodyHtml}</div>
      <button class="popup-btn" onclick="closeEventPopup()">OK</button>
    </div>
  `;
  document.body.appendChild(popup);
}

let patientProgressClickTimer = null;

function getStayQuestionDateKeys() {
  return ['1/11', '1/12', '1/13'];
}

function getProfessionQuestionsOnDate(profession, dateKey) {
  if (!questionData || !profession || !dateKey) return [];
  const professionItem = questionData.professions.find(p => p.profession === profession);
  if (!professionItem) return [];
  const notes = (professionItem.notes || []).filter(n => n.date === dateKey);
  const noteItem = notes.find(n => n.note === 'note_1') || notes[0];
  return Array.isArray(noteItem?.questions) ? noteItem.questions : [];
}

function getProfessionQuestionRowLabel(profession, qIndex) {
  const professionItem = questionData?.professions?.find(p => p.profession === profession);
  const notes = Array.isArray(professionItem?.notes) ? professionItem.notes : [];
  for (let i = 0; i < notes.length; i++) {
    const qs = notes[i]?.questions;
    if (Array.isArray(qs) && qs[qIndex]?.question) return qs[qIndex].question;
  }
  return `Question ${qIndex + 1}`;
}

function fillQaMatrixDetail(profession, dateKey, qIndex) {
  const panel = document.getElementById('qa-matrix-detail');
  if (!panel) return;
  const questions = getProfessionQuestionsOnDate(profession, dateKey);
  const qa = questions[qIndex];
  if (!qa) {
    panel.innerHTML = `<div class="qa-matrix-detail-empty">No Q/A · ${escapeHtml(profession)} · ${escapeHtml(dateKey)} · Q${qIndex + 1}</div>`;
    return;
  }
  const status = getQaStatusMeta(qa, dateKey);
  panel.innerHTML = `
    <div class="qa-matrix-detail-meta">
      ${escapeHtml(profession)} · ${escapeHtml(dateKey)} · Q${qIndex + 1}
      <span class="popup-qa-tone-badge popup-qa-tone-badge--${status.tone}"></span>
    </div>
    <div class="qa-matrix-detail-q"><strong>Q.</strong> ${escapeHtml(qa.question || '')}</div>
    <div class="qa-matrix-detail-a"><strong>A.</strong> ${escapeHtml(qa.answer || 'No answer available.')}</div>
  `;
}

/** Grid popup: questions on the left, stay dates across the top, R/Y/G (or gray) circles. */
function showProgressQaMatrixPopup() {
  const days = getStayQuestionDateKeys();
  const existing = document.getElementById('event-popup');
  if (existing) existing.remove();

  const headerDays = days.map(d => `<th class="qa-matrix-day">${escapeHtml(d)}</th>`).join('');
  const bodyRows = TIMELINE_LANES.map((profession) => {
    const color = DISCIPLINE_COLORS[profession] || '#64748b';
    return [0, 1, 2].map((qIndex) => {
      const qLabel = getProfessionQuestionRowLabel(profession, qIndex);
      const profCell = qIndex === 0
        ? `<td class="qa-matrix-prof" rowspan="3" style="border-left: 4px solid ${color};">${escapeHtml(profession)}</td>`
        : '';
      const dayCells = days.map((dateKey) => {
        const questions = getProfessionQuestionsOnDate(profession, dateKey);
        const qa = questions[qIndex];
        if (!qa) {
          return `<td class="qa-matrix-cell"><button type="button" class="qa-matrix-dot qa-matrix-dot--gray" data-prof="${escapeHtml(profession)}" data-date="${escapeHtml(dateKey)}" data-q="${qIndex}" title="No Q/A" aria-label="No Q/A"></button></td>`;
        }
        const status = getQaStatusMeta(qa, dateKey);
        return `<td class="qa-matrix-cell"><button type="button" class="qa-matrix-dot qa-matrix-dot--${status.tone}" data-prof="${escapeHtml(profession)}" data-date="${escapeHtml(dateKey)}" data-q="${qIndex}" title="${escapeHtml(status.label)}" aria-label="${escapeHtml(profession)} ${escapeHtml(dateKey)} Q${qIndex + 1}"></button></td>`;
      }).join('');
      return `<tr>
        ${profCell}
        <td class="qa-matrix-q" title="${escapeHtml(qLabel)}"><span class="qa-matrix-qnum">Q${qIndex + 1}</span> ${escapeHtml(qLabel)}</td>
        ${dayCells}
      </tr>`;
    }).join('');
  }).join('');

  const popup = document.createElement('div');
  popup.id = 'event-popup';
  popup.innerHTML = `
    <div class="popup-overlay" onclick="closeEventPopup()"></div>
    <div class="popup-content popup-content--qa-matrix">
      <div class="popup-header">
        <span class="popup-phase">Patient Progress</span>
        <span class="popup-close" onclick="closeEventPopup()">&times;</span>
      </div>
      <div class="popup-body popup-body--qa-matrix">
        <div class="qa-matrix-scroll">
          <table class="qa-matrix-table">
            <thead>
              <tr>
                <th class="qa-matrix-prof-h">Team</th>
                <th class="qa-matrix-q-h">Question</th>
                ${headerDays}
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="qa-matrix-detail" id="qa-matrix-detail">Click a circle to read that day's question and answer.</div>
      </div>
      <button class="popup-btn" onclick="closeEventPopup()">OK</button>
    </div>
  `;
  document.body.appendChild(popup);
  popup.querySelectorAll('.qa-matrix-dot').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      popup.querySelectorAll('.qa-matrix-dot.is-active').forEach(el => el.classList.remove('is-active'));
      btn.classList.add('is-active');
      fillQaMatrixDetail(btn.getAttribute('data-prof'), btn.getAttribute('data-date'), Number(btn.getAttribute('data-q')));
    });
  });
}

function bindPatientProgressDotClicks(dotG, event, team) {
  dotG.on('click', function(e) {
    if (e && e.detail > 1) return;
    if (patientProgressClickTimer) clearTimeout(patientProgressClickTimer);
    patientProgressClickTimer = setTimeout(() => {
      patientProgressClickTimer = null;
      hideEventTooltip();
      showEventQaDetails(event, team);
    }, 280);
  });
  dotG.on('dblclick', function(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (patientProgressClickTimer) {
      clearTimeout(patientProgressClickTimer);
      patientProgressClickTimer = null;
    }
    hideEventTooltip();
    showProgressQaMatrixPopup();
  });
}
window.showProgressQaMatrixPopup = showProgressQaMatrixPopup;

function renderPatientProgressTimeline(container, filteredEvents) {
  const phaseCounts = getClinicalTimelinePhaseCounts(filteredEvents);
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 300;
  const margin = { ...CLINICAL_TIMELINE_MARGIN };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const { admit, discharge } = getPatientStayDates();
  const dayLayout = (admit && discharge) ? buildEqualDayLayout(admit, discharge, chartWidth) : null;
  if (!dayLayout) {
    container.innerHTML = '<p style="color:#888;padding:20px;">Admit/discharge dates are required for the timeline.</p>';
    return;
  }

  const yMin = 1.2;
  const yMax = 4.85;
  const scaleX = (x) => x;
  const scaleY = (y) => chartHeight - ((y - yMin) / (yMax - yMin)) * chartHeight;
  const phaseX = dayLayout.phases.map(p => p.x0 + p.width / 2);
  const nPhases = TIMELINE_PHASES.length;

  const activity = Array.from({ length: nPhases }, () => ({}));
  const multiLaneSets = Array.from({ length: nPhases }, () => new Set());
  filteredEvents.forEach(event => {
    const pi = TIMELINE_PHASES.indexOf(event.phase);
    if (pi === -1) return;
    const lanes = getTimelineVisibleLanes(event);
    lanes.forEach(lane => {
      activity[pi][lane] = (activity[pi][lane] || 0) + 1;
    });
    if (lanes.length >= 2) {
      lanes.forEach(l => multiLaneSets[pi].add(l));
    }
  });

  const yCenters = {};
  TIMELINE_LANES.forEach((team, ti) => {
    const arr = new Array(nPhases).fill(BASE_YS[ti]);
    for (let pi = 0; pi < nPhases; pi++) {
      const involved = multiLaneSets[pi];
      if (involved.size && involved.has(team)) {
        const idxs = [...involved].filter(L => TIMELINE_LANES.includes(L)).map(L => TIMELINE_LANES.indexOf(L));
        if (idxs.length) {
          const centroid = idxs.reduce((s, i) => s + BASE_YS[i], 0) / idxs.length;
          arr[pi] = BASE_YS[ti] + PULL_STRENGTH * (centroid - BASE_YS[ti]);
        }
      }
    }
    yCenters[team] = arr;
  });

  const thickness = {};
  let globalMax = 0;
  TIMELINE_LANES.forEach(team => {
    const counts = TIMELINE_PHASES.map((_, pi) => activity[pi][team] || 0);
    counts.forEach(v => { globalMax = Math.max(globalMax, v); });
    thickness[team] = counts;
  });
  if (globalMax < 1) globalMax = 1;
  TIMELINE_LANES.forEach(team => {
    thickness[team] = thickness[team].map(t => Math.max(0.07, (t / globalMax) * 0.32));
  });

  appendSequentialDayBands(g, dayLayout, admit, discharge, chartHeight);
  appendVerticalDayGuides(g, dayLayout, chartHeight);

  appendPhaseHeaders(svg, margin, dayLayout, phaseCounts);

  TIMELINE_LANES.forEach((lane, i) => {
    svg.append('text')
      .attr('x', margin.left - 10)
      .attr('y', margin.top + scaleY(BASE_YS[i]))
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .attr('fill', DISCIPLINE_COLORS[lane])
      .text(lane);
  });

  const laneGeom = {};
  const interpThicknessForTeam = (team, curveX) => {
    const out = [];
    for (let j = 0; j < curveX.length; j++) {
      const xx = curveX[j];
      let i = 0;
      for (; i < phaseX.length - 1 && phaseX[i + 1] < xx; i++);
      if (i >= phaseX.length - 1) out.push(thickness[team][thickness[team].length - 1]);
      else {
        const span = (phaseX[i + 1] - phaseX[i]) || 1;
        const t = (xx - phaseX[i]) / span;
        out.push(thickness[team][i] * (1 - t) + thickness[team][i + 1] * t);
      }
    }
    return out;
  };

  TIMELINE_LANES.forEach((team) => {
    const ctrl = phaseX.map((xi, i) => [xi, yCenters[team][i]]);
    const curve = catmullRomSpline(ctrl, N_SPLINE);
    const tangents = [];
    for (let i = 0; i < curve.length; i++) {
      const prev = curve[Math.max(0, i - 1)];
      const next = curve[Math.min(curve.length - 1, i + 1)];
      tangents.push([next[0] - prev[0], next[1] - prev[1]]);
    }
    const normals = tangents.map((t) => {
      const len = Math.sqrt(t[0] * t[0] + t[1] * t[1]) || 1;
      return [-t[1] / len, t[0] / len];
    });
    const w = interpThicknessForTeam(team, curve.map(c => c[0]));
    laneGeom[team] = { curve, normals, w, color: DISCIPLINE_COLORS[team] };
  });

  TIMELINE_LANES.forEach((team) => {
    const { curve, normals, w, color } = laneGeom[team];
    const top = curve.map((c, j) => [c[0] + normals[j][0] * (w[j] / 2), c[1] + normals[j][1] * (w[j] / 2)]);
    const bot = curve.map((c, j) => [c[0] - normals[j][0] * (w[j] / 2), c[1] - normals[j][1] * (w[j] / 2)]);
    let d = `M ${scaleX(top[0][0])} ${scaleY(top[0][1])}`;
    top.forEach((p, i) => { if (i) d += ` L ${scaleX(p[0])} ${scaleY(p[1])}`; });
    d += ` L ${scaleX(bot[bot.length - 1][0])} ${scaleY(bot[bot.length - 1][1])}`;
    for (let i = bot.length - 2; i >= 0; i--) d += ` L ${scaleX(bot[i][0])} ${scaleY(bot[i][1])}`;
    d += ' Z';
    g.append('path')
      .attr('d', d)
      .attr('fill', color)
      .attr('opacity', 0.3)
      .attr('pointer-events', 'none');
  });

  const nearestCurveIndex = (curve, targetX) => {
    let bestJ = 0;
    let bestD = Infinity;
    curve.forEach((c, j) => {
      const dist = Math.abs(c[0] - targetX);
      if (dist < bestD) {
        bestD = dist;
        bestJ = j;
      }
    });
    return bestJ;
  };

  TIMELINE_LANES.forEach((team) => {
    const { curve, normals, w } = laneGeom[team];
    const teamEvents = filteredEvents.filter(e => (e.lanes || []).includes(team));
    const xByEvent = assignSpreadXByDay(teamEvents, dayLayout, admit, discharge);

    teamEvents.forEach((event) => {
      const targetX = xByEvent.get(event);
      if (targetX == null) return;
      const curveIdx = nearestCurveIndex(curve, targetX);
      const half = Math.max(0.04, (w[curveIdx] || 0.07) / 2);
      const up = (normals[curveIdx][1] >= 0) ? 1 : -1;
      const frac = getPatientProgressHeightFrac(event, team);
      const along = (2 * frac - 1) * half * 0.85;
      const px = curve[curveIdx][0] + up * normals[curveIdx][0] * along;
      const pyData = curve[curveIdx][1] + up * normals[curveIdx][1] * along;
      const py = scaleY(pyData);

      const radius = getPatientProgressDotRadius(event, team);
      const hitR = radius + 6;

      const dotG = g.append('g')
        .attr('class', 'pointillism-event-dot')
        .style('cursor', 'pointer');

      dotG.append('circle')
        .attr('cx', px)
        .attr('cy', py)
        .attr('r', hitR)
        .attr('fill', 'transparent')
        .attr('stroke', 'none')
        .attr('pointer-events', 'all');

      appendPatientProgressPieDot(dotG, px, py, radius, event, team);

      dotG.on('mouseenter', function(e) {
        d3.select(this).select('.pointillism-dot-visible')
          .attr('transform', `translate(${px},${py}) scale(1.22)`);
        showEventTooltip(event, e || window.event);
      });
      dotG.on('mouseleave', function() {
        d3.select(this).select('.pointillism-dot-visible')
          .attr('transform', `translate(${px},${py})`);
        hideEventTooltip();
      });
      bindPatientProgressDotClicks(dotG, event, team);
    });
  });

  appendDayAxisLabels(g, dayLayout, chartHeight);

  g.append('text')
    .attr('x', chartWidth / 2)
    .attr('y', chartHeight + 26)
    .attr('text-anchor', 'middle')
    .attr('font-size', '16px')
    .text('Date');

  drawTimelineLegend(svg, margin, chartWidth, 'patient_progress_timeline');
}

function renderPointillismTimeline(container, filteredEvents) {
  const phaseCounts = getClinicalTimelinePhaseCounts(filteredEvents);
  const patientProgressView = currentTimelineMode === 'patient_progress_timeline';
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 300;
  
  const margin = { ...CLINICAL_TIMELINE_MARGIN };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  const { admit, discharge } = getPatientStayDates();
  const dayLayout = (admit && discharge) ? buildEqualDayLayout(admit, discharge, chartWidth) : null;
  if (!dayLayout) {
    container.innerHTML = '<p style="color:#888;padding:20px;">Admit/discharge dates are required for the timeline.</p>';
    return;
  }

  const yMin = 1.2, yMax = 4.85;
  // X is already in chart pixels (day-proportional). Y stays in ribbon data space.
  const scaleX = (x) => x;
  const scaleY = (y) => chartHeight - ((y - yMin) / (yMax - yMin)) * chartHeight;

  // Control X = center of each day-proportional phase column
  const phaseX = dayLayout.phases.map(p => p.x0 + p.width / 2);
  
  // Build activity data
  const nPhases = TIMELINE_PHASES.length;
  const activity = Array.from({ length: nPhases }, () => ({}));
  const multiLaneSets = Array.from({ length: nPhases }, () => new Set());
  
  filteredEvents.forEach(event => {
    const pi = TIMELINE_PHASES.indexOf(event.phase);
    if (pi === -1) return;
    const lanes = getTimelineVisibleLanes(event);
    lanes.forEach(lane => {
      activity[pi][lane] = (activity[pi][lane] || 0) + 1;
    });
    if (lanes.length >= 2) {
      lanes.forEach(l => multiLaneSets[pi].add(l));
    }
  });
  
  // Calculate Y-centers with pull toward collaboration
  const yCenters = {};
  TIMELINE_LANES.forEach((team, ti) => {
    const arr = new Array(nPhases).fill(BASE_YS[ti]);
    for (let pi = 0; pi < nPhases; pi++) {
      const involved = multiLaneSets[pi];
      if (involved.size && involved.has(team)) {
        const idxs = [...involved].filter(L => TIMELINE_LANES.includes(L)).map(L => TIMELINE_LANES.indexOf(L));
        if (idxs.length) {
          const centroid = idxs.reduce((s, i) => s + BASE_YS[i], 0) / idxs.length;
          arr[pi] = BASE_YS[ti] + PULL_STRENGTH * (centroid - BASE_YS[ti]);
        }
      }
    }
    yCenters[team] = arr;
  });
  
  // Calculate ribbon thickness
  const thickness = {};
  let globalMax = 0;
  TIMELINE_LANES.forEach(team => {
    const counts = TIMELINE_PHASES.map((_, pi) => activity[pi][team] || 0);
    counts.forEach(v => globalMax = Math.max(globalMax, v));
    thickness[team] = counts;
  });
  if (globalMax < 1) globalMax = 1;
  TIMELINE_LANES.forEach(team => {
    thickness[team] = thickness[team].map(t => Math.max(0.07, (t / globalMax) * 0.32));
  });
  
  // Draw phase labels (shorten when columns are narrow so they do not overlap)
  appendPhaseHeaders(svg, margin, dayLayout, phaseCounts);
  
  // Draw discipline labels
  TIMELINE_LANES.forEach((lane, i) => {
    svg.append('text')
      .attr('x', margin.left - 10)
      .attr('y', margin.top + scaleY(BASE_YS[i]))
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .attr('fill', DISCIPLINE_COLORS[lane])
      .text(lane);
  });
  
  // Seeded random for reproducibility
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const normalRandom = (mu, sigma) => {
    const u1 = random(), u2 = random();
    if (u1 <= 0) return mu;
    return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  
  // Per-lane geometry (shared across passes) — X in pixels
  const laneGeom = {};
  const interpThicknessForTeam = (team, curveX) => {
    const out = [];
    for (let j = 0; j < curveX.length; j++) {
      const xx = curveX[j];
      let i = 0;
      for (; i < phaseX.length - 1 && phaseX[i + 1] < xx; i++);
      if (i >= phaseX.length - 1) out.push(thickness[team][thickness[team].length - 1]);
      else {
        const span = (phaseX[i + 1] - phaseX[i]) || 1;
        const t = (xx - phaseX[i]) / span;
        out.push(thickness[team][i] * (1 - t) + thickness[team][i + 1] * t);
      }
    }
    return out;
  };
  
  TIMELINE_LANES.forEach((team) => {
    const ctrl = phaseX.map((xi, i) => [xi, yCenters[team][i]]);
    const curve = catmullRomSpline(ctrl, N_SPLINE);
    const tangents = [];
    for (let i = 0; i < curve.length; i++) {
      const prev = curve[Math.max(0, i - 1)];
      const next = curve[Math.min(curve.length - 1, i + 1)];
      tangents.push([next[0] - prev[0], next[1] - prev[1]]);
    }
    const normals = tangents.map(t => {
      const len = Math.sqrt(t[0] * t[0] + t[1] * t[1]) || 1;
      return [-t[1] / len, t[0] / len];
    });
    const curveXVals = curve.map(c => c[0]);
    const w = interpThicknessForTeam(team, curveXVals);
    laneGeom[team] = { curve, normals, w, color: DISCIPLINE_COLORS[team] };
  });
  
  appendSequentialDayBands(g, dayLayout, admit, discharge, chartHeight);
  appendVerticalDayGuides(g, dayLayout, chartHeight);
  
  // Pass 1: ribbons
  TIMELINE_LANES.forEach((team) => {
    const { curve, normals, w, color } = laneGeom[team];
    const top = curve.map((c, j) => [c[0] + normals[j][0] * (w[j] / 2), c[1] + normals[j][1] * (w[j] / 2)]);
    const bot = curve.map((c, j) => [c[0] - normals[j][0] * (w[j] / 2), c[1] - normals[j][1] * (w[j] / 2)]);
    let d = `M ${scaleX(top[0][0])} ${scaleY(top[0][1])}`;
    top.forEach((p, i) => { if (i) d += ` L ${scaleX(p[0])} ${scaleY(p[1])}`; });
    d += ` L ${scaleX(bot[bot.length - 1][0])} ${scaleY(bot[bot.length - 1][1])}`;
    for (let i = bot.length - 2; i >= 0; i--) d += ` L ${scaleX(bot[i][0])} ${scaleY(bot[i][1])}`;
    d += ' Z';
    g.append('path')
      .attr('d', d)
      .attr('fill', color)
      .attr('opacity', 0.3)
      .attr('pointer-events', 'none');
  });
  
  // Pass 2: dots placed by JSON report date on the day-proportional axis
  const nearestCurveIndex = (curve, targetX) => {
    let bestJ = 0;
    let bestD = Infinity;
    curve.forEach((c, j) => {
      const dist = Math.abs(c[0] - targetX);
      if (dist < bestD) {
        bestD = dist;
        bestJ = j;
      }
    });
    return bestJ;
  };

  TIMELINE_LANES.forEach((team) => {
    const { curve, normals, w, color } = laneGeom[team];
    const teamEvents = filteredEvents.filter(e => (e.lanes || []).includes(team));
    const xByEvent = assignSpreadXByDay(teamEvents, dayLayout, admit, discharge);

    teamEvents.forEach((event) => {
      const targetX = xByEvent.get(event);
      if (targetX == null) return;
      const curveIdx = nearestCurveIndex(curve, targetX);

      const wSafe = Math.max(0.12, w[curveIdx] || 0.15);
      const offset = Math.max(-0.45, Math.min(0.45, normalRandom(0, 0.14) * wSafe));
      const px = curve[curveIdx][0] + normals[curveIdx][0] * offset;
      const py = curve[curveIdx][1] + normals[curveIdx][1] * offset;

      const eventLen = Math.max(0, event.len || 0);
      let radius;
      if (eventLen <= 200) {
        radius = 3.2 + (eventLen / 200) * (5 - 3.2);
      } else if (eventLen <= 225) {
        radius = 5 + ((eventLen - 200) / 25) * (6.5 - 5);
      } else if (eventLen <= 450) {
        radius = 6.5 + ((eventLen - 225) / 225) * (8 - 6.5);
      } else {
        radius = 8;
      }
      const hitR = radius + 6;

      const dotG = g.append('g')
        .attr('class', 'pointillism-event-dot')
        .style('cursor', 'pointer');

      dotG.append('circle')
        .attr('cx', scaleX(px))
        .attr('cy', scaleY(py))
        .attr('r', hitR)
        .attr('fill', 'transparent')
        .attr('stroke', 'none')
        .attr('pointer-events', 'all');

      const dotFill = patientProgressView ? getPatientProgressDotColor(event, team) : color;
      dotG.append('circle')
        .attr('class', 'pointillism-dot-visible')
        .attr('cx', scaleX(px))
        .attr('cy', scaleY(py))
        .attr('r', radius)
        .attr('fill', dotFill)
        .attr('stroke', patientProgressView ? '#1f2937' : '#555')
        .attr('stroke-width', 0.85)
        .attr('opacity', 0.92)
        .attr('pointer-events', 'none');

      dotG.on('mouseenter', function(e) {
        d3.select(this).select('.pointillism-dot-visible')
          .attr('r', radius * 1.22)
          .attr('stroke-width', 1.6);
        showEventTooltip(event, e || window.event, patientProgressView ? team : null);
      });
      dotG.on('mouseleave', function() {
        d3.select(this).select('.pointillism-dot-visible')
          .attr('r', radius)
          .attr('stroke-width', 0.85);
        hideEventTooltip();
      });
      dotG.on('click', function() {
        if (patientProgressView) {
          showEventQaDetails(event, team);
        } else {
          showEventDetails(event);
        }
      });
    });
  });
  
  // Date labels under each equal-width day column
  appendDayAxisLabels(g, dayLayout, chartHeight);
  
  // X-axis label
  g.append('text')
    .attr('x', chartWidth / 2)
    .attr('y', chartHeight + 26)
    .attr('text-anchor', 'middle')
    .attr('font-size', '16px')
    .text('Date');
  
  // Legend
  drawTimelineLegend(svg, margin, chartWidth, patientProgressView ? 'patient_progress_timeline' : 'pointillism');
}

function wrapSvgText(textSelection, maxWidth, lineHeightPx) {
  if (!textSelection || maxWidth <= 0) return 1;
  const raw = (textSelection.text() || '').trim();
  if (!raw) return 1;

  const x = Number(textSelection.attr('x')) || 0;
  const y = Number(textSelection.attr('y')) || 0;
  const words = raw.split(/\s+/);
  textSelection.text('');

  let line = [];
  let lineCount = 1;
  let tspan = textSelection.append('tspan').attr('x', x).attr('y', y);

  const pushNewLine = (chunk) => {
    lineCount += 1;
    line = [chunk];
    tspan = textSelection
      .append('tspan')
      .attr('x', x)
      .attr('y', y + ((lineCount - 1) * lineHeightPx))
      .text(chunk);
  };

  const appendChunk = (chunk) => {
    const testLine = [...line, chunk].join(' ');
    tspan.text(testLine);
    if (tspan.node().getComputedTextLength() <= maxWidth) {
      line = [...line, chunk];
      return;
    }
    if (line.length === 0) {
      // Single long token: hard-wrap by characters.
      let segment = '';
      for (const ch of chunk) {
        const next = `${segment}${ch}`;
        tspan.text(next);
        if (tspan.node().getComputedTextLength() > maxWidth && segment.length > 0) {
          tspan.text(segment);
          pushNewLine(ch);
          segment = ch;
        } else {
          segment = next;
        }
      }
      tspan.text(segment);
      line = [segment];
      return;
    }
    // Revert current line before moving overflowing word to the next line.
    tspan.text(line.join(' '));
    pushNewLine(chunk);
  };

  words.forEach((word) => appendChunk(word));
  return lineCount;
}

// Draw legend for timeline
function drawTimelineLegend(svg, margin, chartWidth, mode) {
  const svgWidth = Number(svg.attr('width')) || svg.node()?.getBoundingClientRect?.().width || 0;
  // Keep legend inside the right white margin (never shift left onto the chart).
  const legendX = margin.left + chartWidth + 12;
  let legendY = margin.top;
  const legendWidth = Math.max(60, svgWidth - legendX - 8);
  const legendScale = Math.max(1, Math.min(1.45, chartWidth / 700));
  // Patient Progress legend fonts are +4pt vs the shared base sizes.
  const progressFontBump = mode === 'patient_progress_timeline' ? 4 : 0;
  const titleSize = `${Math.round(15 * legendScale) + progressFontBump}px`;
  const textSize = `${Math.round(14 * legendScale) + progressFontBump}px`;
  const smallTextSize = `${Math.round(13 * legendScale) + progressFontBump}px`;
  const laneTextSize = `${Math.round(12 * legendScale) + progressFontBump}px`;
  const markerR = 5 * legendScale;
  const markerRSmall = 4 * legendScale;
  const markerX = 6 * legendScale;
  const textX = 16 * legendScale;
  const textXSmall = 14 * legendScale;
  const rowStep = 18 * legendScale;
  const rowStepSmall = 13 * legendScale;
  const smallLineHeight = (11 * legendScale) + progressFontBump;
  const laneLineHeight = (10 * legendScale) + progressFontBump;
  const labelWrapWidth = Math.max(40, legendWidth - textX - 2);
  const labelWrapWidthSmall = Math.max(36, legendWidth - textXSmall - 2);

  if (mode === 'patient_progress_timeline') {
    // Larger, consistent legend type for Patient Progress (Status + Disciplines + items).
    const headingSize = `${Math.round(16 * legendScale)}px`;
    const itemSize = `${Math.round(15 * legendScale)}px`;
    const itemLineHeight = 14 * legendScale;
    const headingStep = 18 * legendScale;
    const itemStep = 16 * legendScale;

    svg.append('text')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('font-size', headingSize)
      .attr('font-weight', '400')
      .attr('fill', '#111827')
      .text('Status');
    legendY += headingStep;
    const progressLegend = [
      { fill: '#dc2626', label: 'Risk' },
      { fill: '#ca8a04', label: 'Monitoring' },
      { fill: '#16a34a', label: 'Improving' }
    ];
    progressLegend.forEach(({ fill, label }) => {
      svg.append('circle')
        .attr('cx', legendX + markerX)
        .attr('cy', legendY)
        .attr('r', markerR)
        .attr('fill', fill)
        .attr('stroke', '#1f2937')
        .attr('stroke-width', 0.4);
      const labelText = svg.append('text')
        .attr('x', legendX + textX)
        .attr('y', legendY + (3 * legendScale))
        .attr('font-size', itemSize)
        .attr('font-weight', '400')
        .attr('fill', '#334155')
        .text(label);
      const lineCount = wrapSvgText(labelText, labelWrapWidth, itemLineHeight);
      const blockHeight = Math.max((markerR * 2) + 2, lineCount * itemLineHeight + 2, itemStep);
      legendY += blockHeight;
    });
    // Two blank-line gaps between Status block and Disciplines
    legendY += 2 * itemStep;
    const disciplinesHeading = svg.append('text')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('font-size', headingSize)
      .attr('font-weight', '400')
      .attr('fill', '#111827')
      .text('Disciplines');
    const disciplinesHeadingLines = wrapSvgText(disciplinesHeading, labelWrapWidth, itemLineHeight);
    legendY += Math.max(headingStep, disciplinesHeadingLines * itemLineHeight + 2);
    TIMELINE_LANES.forEach(lane => {
      svg.append('circle')
        .attr('cx', legendX + markerX)
        .attr('cy', legendY)
        .attr('r', markerRSmall)
        .attr('fill', DISCIPLINE_COLORS[lane]);
      const laneText = svg.append('text')
        .attr('x', legendX + textXSmall)
        .attr('y', legendY + (3 * legendScale))
        .attr('font-size', itemSize)
        .attr('font-weight', '400')
        .text(lane);
      const lineCount = wrapSvgText(laneText, labelWrapWidthSmall, itemLineHeight);
      legendY += Math.max(itemStep, lineCount * itemLineHeight + 2);
    });
    return;
  }
  
  svg.append('text')
    .attr('x', legendX)
    .attr('y', legendY)
    .attr('font-size', titleSize)
    .attr('font-weight', 'bold')
    .text('Disciplines');
  legendY += rowStep;
  
  TIMELINE_LANES.forEach(lane => {
    svg.append('circle')
      .attr('cx', legendX + markerX)
      .attr('cy', legendY)
      .attr('r', markerR)
      .attr('fill', DISCIPLINE_COLORS[lane]);
    
    svg.append('text')
      .attr('x', legendX + textX)
      .attr('y', legendY + (4 * legendScale))
      .attr('font-size', textSize)
      .text(lane);
    legendY += rowStep;
  });
  
  if (mode === 'storyline') {
    legendY += 8 * legendScale;
    svg.append('line')
      .attr('x1', legendX)
      .attr('x2', legendX + (12 * legendScale))
      .attr('y1', legendY)
      .attr('y2', legendY)
      .attr('stroke', '#666')
      .attr('stroke-width', 2);
    
    const collabText = svg.append('text')
      .attr('x', legendX + textX)
      .attr('y', legendY + (4 * legendScale))
      .attr('font-size', smallTextSize)
      .text('Collaboration');
    wrapSvgText(collabText, labelWrapWidth, smallLineHeight);
  }
}

// Generate date labels for timeline — aligned with mapDateToPhase / getPhaseDateBounds
function generateDateLabels(admitStr, dischargeStr) {
  const admitDate = parseDateFromText(admitStr) || parsePatientDashboardDate(admitStr);
  const dischargeDate = parseDateFromText(dischargeStr) || parsePatientDashboardDate(dischargeStr);
  if (!admitDate || !dischargeDate) return [];

  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const bounds = getPhaseDateBounds(admitDate, dischargeDate);
  if (!bounds) return [];

  return TIMELINE_PHASES.map((phase) => {
    const range = bounds[phase];
    if (!range) return '';
    const startText = fmt(range[0]);
    const endText = fmt(range[1]);
    return startText === endText ? startText : `${startText}–${endText}`;
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function entitiesObjectToByType(entities) {
  if (!entities || typeof entities !== 'object') return null;
  const by = { PROBLEM: [], TREATMENT: [], TEST: [], OCCURRENCE: [], EVIDENTIAL: [] };
  for (const e of Object.values(entities)) {
    if (!e || !e.text || !e.type) continue;
    if (by[e.type]) by[e.type].push(e.text);
  }
  return by;
}

function dedupeEntityTexts(list) {
  const isLikelyGarbled = (s) => {
    if (!s) return true;
    // Common mojibake / replacement markers seen in broken UTF-8 decoding.
    if (/[�]|Ã|Â|ï¿½/.test(s)) return true;
    // Reject strings with too many isolated one-letter fragments.
    const tokens = s.split(/\s+/).filter(Boolean);
    const singleCharCount = tokens.filter((t) => /^[a-z]$/i.test(t)).length;
    if (tokens.length >= 4 && singleCharCount / tokens.length > 0.45) return true;
    return false;
  };

  const isMeaningfulClinicalPhrase = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 3) return false;
    if (isLikelyGarbled(t)) return false;
    const letters = t.match(/[A-Za-z]/g) || [];
    if (letters.length < 3) return false;
    // Keep common abbreviations, otherwise require at least one vowel.
    const vowels = t.match(/[AEIOUaeiou]/g) || [];
    const hasMedicalAbbrev = /\b(RN|MD|PT|OT|SLP|SW|ICU|ER|ADL|DME|SAR|TBI)\b/.test(t);
    if (!hasMedicalAbbrev && vowels.length === 0) return false;
    return true;
  };

  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const t = String(raw).trim();
    if (!t) continue;
    if (!isMeaningfulClinicalPhrase(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

const ENTITY_SECTION_ORDER = [
  ['PROBLEM', 'Problems'],
  ['TREATMENT', 'Treatments'],
  ['TEST', 'Tests & monitoring'],
  ['OCCURRENCE', 'Events & status'],
  ['EVIDENTIAL', 'Evidence']
];

/** Readable HTML from SpanT entities (grouped by type). */
function formatStructuredClinicalNoteHtml(block) {
  const byType = block.entitiesByType || entitiesObjectToByType(block.entities || null);
  if (!byType) return null;
  const parts = [];
  for (const [type, label] of ENTITY_SECTION_ORDER) {
    const items = dedupeEntityTexts(byType[type]);
    if (!items.length) continue;
    const slug = String(type).toLowerCase();
    const lis = items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    parts.push(
      `<div class="popup-entity-group popup-entity-group--${slug}"><div class="popup-entity-type">${escapeHtml(label)}</div><ul class="popup-entity-list">${lis}</ul></div>`
    );
  }
  return parts.length ? `<div class="popup-entity-structured">${parts.join('')}</div>` : null;
}

/** Short plain preview for tooltip when structured entities exist. */
function formatStructuredPlainPreview(block) {
  const byType = block.entitiesByType || entitiesObjectToByType(block.entities || null);
  if (!byType) return null;
  const lines = [];
  for (const [type, label] of ENTITY_SECTION_ORDER) {
    const items = dedupeEntityTexts(byType[type]);
    if (!items.length) continue;
    const head = items.slice(0, 3).join('; ');
    const more = items.length > 3 ? ` (+${items.length - 3} more)` : '';
    lines.push(`${label}: ${head}${more}`);
  }
  return lines.length ? lines.join('\n') : null;
}

/** Fallback when there is no entity structure: break long blobs on common section anchors. */
function formatUnstructuredBlobHtml(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const splitRe = /\s+(?=Fall Risk\b|Progressing Flowsheets\b|Discharge\b|Collaborate\b|Assist\b|Administer medications\b|Identify discharge\b)/gi;
  const pieces = t.split(splitRe).map((s) => s.trim()).filter(Boolean);
  if (pieces.length <= 1) {
    return `<div class="popup-blob-text">${escapeHtml(t).replace(/\n/g, '<br>')}</div>`;
  }
  return `<div class="popup-blob-chunks">${pieces
    .map((p) => `<p class="popup-blob-para">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>`;
}

function normalizeNoteText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** True when summary and note text are the same blob (common after origin attach). */
function textsAreNearlySame(a, b) {
  const na = normalizeNoteText(a);
  const nb = normalizeNoteText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const short = na.length <= nb.length ? na : nb;
  const long = na.length > nb.length ? na : nb;
  if (short.length < long.length * 0.88) return false;
  return long.includes(short);
}

/**
 * Blocks for popup/tooltip: summary vs each clinical note (filename → meta → body).
 * Dedupes: if every linked note matches the summary text, only clinical note blocks are shown.
 */
function buildEventSourceBlocks(event) {
  const blocks = [];
  const snippet = (event.snippet && event.snippet.trim()) || '';
  const notes = event.origin_notes && event.origin_notes.length ? event.origin_notes : [];
  const noteBodies = notes.map((n) => (n.text || '').trim()).filter(Boolean);

  let includeSummary = Boolean(snippet);
  if (snippet && noteBodies.length) {
    const allNotesMatchSnippet = noteBodies.every((t) => textsAreNearlySame(t, snippet));
    if (allNotesMatchSnippet) includeSummary = false;
  }

  if (includeSummary && snippet) {
    blocks.push({ kind: 'summary', title: 'Summary narrative', meta: '', body: snippet, entitiesByType: null, entities: null });
  }

  notes.forEach((n, idx) => {
    const t = (n.text || '').trim();
    if (!t) return;
    if (includeSummary && snippet && textsAreNearlySame(t, snippet)) return;
    const file = n.filename || `Note ${idx + 1}`;
    const meta = [n.date, n.lane].filter(Boolean).join(' · ');
    blocks.push({
      kind: 'clinical_note',
      title: `Clinical note: ${file}`,
      meta,
      body: t,
      entitiesByType: n.entitiesByType || null,
      entities: n.entities || null
    });
  });

  if (!blocks.length && snippet) {
    blocks.push({ kind: 'summary', title: 'Summary narrative', meta: '', body: snippet, entitiesByType: null, entities: null });
  }

  return blocks;
}

/** Plain-text preview with blank lines between sources (for tooltip). */
function buildEventSourcePreviewPlain(event, maxLen) {
  const blocks = buildEventSourceBlocks(event);
  if (!blocks.length) return '(Click for details)';
  const parts = blocks.map((b) => {
    let bodyPreview = b.body;
    if (b.kind === 'clinical_note') {
      const structured = formatStructuredPlainPreview(b);
      if (structured) {
        bodyPreview = structured;
      } else if (b.entitiesByType || b.entities) {
        bodyPreview = 'No clear extracted entities for this note.';
      }
    }
    if (b.kind === 'clinical_note' && b.meta) {
      return `${b.title}\n${b.meta}\n${bodyPreview}`;
    }
    return `${b.title}\n${bodyPreview}`;
  });
  const text = parts.join('\n\n');
  if (maxLen && text.length > maxLen) return text.slice(0, maxLen) + '…';
  return text;
}

// Show event tooltip
function showEventTooltip(event, mouseEvent, qaProfession) {
  let tooltip = document.getElementById('event-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'event-tooltip';
    tooltip.className = 'event-tooltip';
    document.body.appendChild(tooltip);
  }
  
  const disciplines = (event.lanes || []).join(', ');
  const isCollab = (event.lanes || []).length > 1;
  const phaseLabel = getTimelinePhaseLabel(event.phase);
  const safePhase = escapeHtml(`${phaseLabel}${isCollab ? ' (Collaborative)' : ''}`);
  const safeDisc = escapeHtml(disciplines);

  // Patient Progress mode: preview Q&A instead of summary/note text
  if (qaProfession) {
    const found = findQuestionsForProfessionAndEvent(qaProfession, event);
    if (!found.questions.length) {
      tooltip.innerHTML = `
        <div class="event-tooltip-title">${safePhase} · ${escapeHtml(qaProfession)}</div>
        <div class="event-tooltip-content">No Q/A</div>
      `;
    } else {
      const status = aggregateQaToneFromQuestions(found.questions, found.sourceDate);
      const firstQ = escapeHtml(found.questions[0]?.question || '');
      const dateLine = `Q/A date: ${escapeHtml(found.sourceDate || found.requestedDate || '—')}`;
      tooltip.innerHTML = `
        <div class="event-tooltip-title">${safePhase} · ${escapeHtml(qaProfession)}</div>
        <div class="event-tooltip-content">
          <strong>Status:</strong> ${escapeHtml(status.label)}<br>
          <strong>${dateLine}</strong><br>
          <strong>Q1:</strong> ${firstQ}<br>
          <em>Click for full Q&amp;A</em>
        </div>
      `;
    }
  } else {
    const rawSummary = buildEventSourcePreviewPlain(event, 360);
    const safeSummary = escapeHtml(rawSummary).replace(/\n/g, '<br>');
    tooltip.innerHTML = `
      <div class="event-tooltip-title">${safePhase}</div>
      <div class="event-tooltip-content">
        <strong>Disciplines:</strong> ${safeDisc}<br>
        <strong>Details:</strong><br><span class="event-tooltip-multisource">${safeSummary}</span>
      </div>
      ${event.origin_notes && event.origin_notes.length ? `<div class="event-tooltip-similar">Linked notes: ${event.origin_notes.length}</div>` : ''}
    `;
  }
  
  tooltip.style.display = 'block';
  tooltip.style.left = (mouseEvent.pageX + 15) + 'px';
  tooltip.style.top = (mouseEvent.pageY - 10) + 'px';
}

// Hide event tooltip
function hideEventTooltip() {
  const tooltip = document.getElementById('event-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Show event details (on click) - custom popup
function showEventDetails(event) {
  const disciplines = (event.lanes || []).join(', ');
  const blocks = buildEventSourceBlocks(event);
  let bodyHtml = '';
  if (blocks.length === 0) {
    bodyHtml = `<p class="popup-body-empty">${escapeHtml('No details available for this event.')}</p>`;
  } else {
    bodyHtml = blocks
      .map((b) => {
        const safeTitle = escapeHtml(b.title);
        const safeMeta = b.meta
          ? `<div class="popup-source-meta">${escapeHtml(b.meta)}</div>`
          : '';
        let bodyInner;
        if (b.kind === 'clinical_note') {
          const structured = formatStructuredClinicalNoteHtml(b);
          if (structured) {
            bodyInner = structured;
          } else if (b.entitiesByType || b.entities) {
            bodyInner = '<div class="popup-source-text-fallback">No clear extracted entities for this note.</div>';
          } else {
            bodyInner = b.body.length > 160
              ? formatUnstructuredBlobHtml(b.body)
              : `<div class="popup-source-text-fallback">${escapeHtml(b.body).replace(/\n/g, '<br>')}</div>`;
          }
        } else {
          bodyInner =
            b.body.length > 200 ? formatUnstructuredBlobHtml(b.body) : `<div class="popup-source-text-fallback">${escapeHtml(b.body).replace(/\n/g, '<br>')}</div>`;
        }
        const noteClass = b.kind === 'clinical_note' ? ' popup-source-block--note' : '';
        return `<section class="popup-source-block${noteClass}"><header class="popup-source-title">${safeTitle}</header>${safeMeta}<div class="popup-source-body">${bodyInner}</div></section>`;
      })
      .join('');
  }
  
  const phaseLabel = getTimelinePhaseLabel(event.phase);
  const safePhase = escapeHtml(phaseLabel);
  const safeDisc = escapeHtml(disciplines);
  
  const existing = document.getElementById('event-popup');
  if (existing) existing.remove();
  
  const popup = document.createElement('div');
  popup.id = 'event-popup';
  popup.innerHTML = `
    <div class="popup-overlay" onclick="closeEventPopup()"></div>
    <div class="popup-content">
      <div class="popup-header">
        <span class="popup-phase">${safePhase}</span>
        <span class="popup-close" onclick="closeEventPopup()">&times;</span>
      </div>
      <div class="popup-disciplines">Disciplines: ${safeDisc}</div>
      <div class="popup-body">${bodyHtml}</div>
      <button class="popup-btn" onclick="closeEventPopup()">OK</button>
    </div>
  `;
  document.body.appendChild(popup);
}

function closeEventPopup() {
  const popup = document.getElementById('event-popup');
  if (popup) popup.remove();
}

// Render Clinical Evidence Summary Matrix
function renderReadinessMatrix() {
  const container = document.getElementById('readiness-matrix-container');
  if (!container) return;
  
  // Dispatch based on current mode
  switch (currentMatrixMode) {
    case 'scorecard':
      renderProgressScoreCard(container);
      break;
    case 'all_patient_summary':
    case 'all_team_summary':
      renderAllPatientSummary(container);
      break;
    case 'checklist':
      renderReadinessChecklist(container);
      break;
    case 'heatmap':
      renderTeamActivityHeatmap(container);
      break;
    case 'sparklines':
      renderTrendSparklines(container);
      break;
    default:
      renderProgressScoreCard(container);
  }
}

// ===== 1. PROGRESS SCORE CARD =====
function renderProgressScoreCard(container) {
  const events = applySidebarFiltersToEvents(clinicalEventsData?.events || []);
  const teams = ['MD', 'RN', 'PT', 'OT', 'SLP', 'SW'];
  const teamColors = DISCIPLINE_COLORS;
  
  // Calculate readiness scores per team based on discharge-related keywords
  const readinessKeywords = {
    'MD': ['stable', 'clear', 'resolved', 'improved', 'discharge', 'home'],
    'RN': ['independent', 'education', 'teaching', 'self-care', 'vitals stable', 'progressing'],
    'PT': ['ambulate', 'independent', 'stairs', 'safe', 'home exercise', 'mobility', 'walk'],
    'OT': ['independent', 'adl', 'self-care', 'equipment', 'modified', 'functional'],
    'SLP': ['regular diet', 'tolerated', 'communication', 'safe swallow', 'oral'],
    'SW': ['placement', 'arranged', 'follow-up', 'resources', 'caregiver', 'sar', 'discharge']
  };
  
  const scores = {};
  teams.forEach(team => {
    // Use 'lanes' property (the actual field in events.json)
    const teamEvents = events.filter(e => {
      const lanes = e.lanes || e.disciplines || [];
      return lanes.some(lane => {
        const laneUpper = lane.toUpperCase();
        return laneUpper === team || laneUpper.includes(team);
      });
    });
    
    let metCount = 0;
    const keywords = readinessKeywords[team] || [];
    
    teamEvents.forEach(event => {
      const text = (event.snippet || '').toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        metCount++;
      }
    });
    
    const totalRelevant = Math.max(teamEvents.length, 1);
    // Base score on keyword matches, with a minimum baseline
    const baseScore = Math.round((metCount / totalRelevant) * 100);
    scores[team] = Math.min(100, Math.max(baseScore, teamEvents.length > 0 ? 20 : 0));
  });
  
  let html = '<div class="scorecard-grid">';
  
  teams.forEach(team => {
    const score = scores[team] || 0;
    const color = teamColors[team];
    html += `
      <div class="scorecard-item">
        <div class="scorecard-team" style="color: ${color};">${team}</div>
        <div class="scorecard-gauge">
          <div class="scorecard-fill" style="width: ${score}%; background: ${color};"></div>
        </div>
        <div class="scorecard-percent" style="color: ${score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'};">${score}%</div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// ===== 2. READINESS CHECKLIST =====
function renderReadinessChecklist(container) {
  const events = applySidebarFiltersToEvents(clinicalEventsData?.events || []);
  
  // Define discharge readiness criteria
  const criteria = [
    { text: 'Medical stability achieved', team: 'MD', keywords: ['stable', 'resolved', 'controlled'] },
    { text: 'Pain management optimized', team: 'MD', keywords: ['pain controlled', 'comfort', 'analgesic'] },
    { text: 'Vital signs within normal', team: 'RN', keywords: ['vitals stable', 'afebrile', 'normal'] },
    { text: 'Patient/family education complete', team: 'RN', keywords: ['education', 'teaching', 'instruct'] },
    { text: 'Independent ambulation', team: 'PT', keywords: ['independent', 'ambulate', 'walk'] },
    { text: 'Stairs cleared', team: 'PT', keywords: ['stairs', 'steps', 'cleared'] },
    { text: 'ADL independence achieved', team: 'OT', keywords: ['independent', 'adl', 'self-care'] },
    { text: 'Home equipment arranged', team: 'OT', keywords: ['equipment', 'dme', 'ordered'] },
    { text: 'Safe swallowing confirmed', team: 'SLP', keywords: ['safe', 'swallow', 'tolerated'] },
    { text: 'Diet advanced appropriately', team: 'SLP', keywords: ['diet', 'regular', 'advanced'] },
    { text: 'Discharge placement confirmed', team: 'SW', keywords: ['placement', 'arranged', 'home'] },
    { text: 'Follow-up appointments set', team: 'SW', keywords: ['follow-up', 'appointment', 'scheduled'] }
  ];
  
  const teamColors = DISCIPLINE_COLORS;
  
  // Check each criterion against events
  const results = criteria.map(criterion => {
    const allText = events.map(e => (e.snippet || '').toLowerCase()).join(' ');
    const matched = criterion.keywords.some(kw => allText.includes(kw));
    const partial = criterion.keywords.some(kw => 
      events.some(e => (e.snippet || '').toLowerCase().includes(kw.split(' ')[0]))
    );
    
    return {
      ...criterion,
      status: matched ? 'met' : (partial ? 'partial' : 'unmet')
    };
  });
  
  let html = '<div class="checklist-container">';
  
  results.forEach(item => {
    const icon = item.status === 'met' ? '✓' : item.status === 'partial' ? '◐' : '○';
    const color = teamColors[item.team];
    
    html += `
      <div class="checklist-item">
        <span class="checklist-icon ${item.status}">${icon}</span>
        <span class="checklist-text">${item.text}</span>
        <span class="checklist-team" style="background: ${color};">${item.team}</span>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// ===== 3. TEAM ACTIVITY HEATMAP =====
function renderTeamActivityHeatmap(container) {
  const events = applySidebarFiltersToEvents(clinicalEventsData?.events || []);
  const teams = ['MD', 'RN', 'PT', 'OT', 'SLP', 'SW'];
  const phases = ['Home', 'ER', 'Unit', 'Discharge', 'Post-Discharge'];
  
  // Count events per team per phase
  const heatmapData = {};
  teams.forEach(team => {
    heatmapData[team] = {};
    phases.forEach(phase => {
      heatmapData[team][phase] = 0;
    });
  });
  
  events.forEach(event => {
    const phase = event.phase || 'Unit';
    // Use 'lanes' property (the actual field in events.json)
    const lanes = event.lanes || event.disciplines || [];
    
    lanes.forEach(lane => {
      const laneUpper = lane.toUpperCase();
      // Find matching team
      const matchedTeam = teams.find(t => laneUpper === t || laneUpper.includes(t));
      if (matchedTeam && heatmapData[matchedTeam] && phases.includes(phase)) {
        heatmapData[matchedTeam][phase]++;
      }
    });
  });
  
  // Find max for color scaling
  let maxVal = 1;
  teams.forEach(team => {
    phases.forEach(phase => {
      maxVal = Math.max(maxVal, heatmapData[team][phase]);
    });
  });
  
  const getHeatColor = (val) => {
    if (val === 0) return '#f8f9fa';
    const intensity = val / maxVal;
    if (intensity < 0.25) return '#dcfce7';
    if (intensity < 0.5) return '#86efac';
    if (intensity < 0.75) return '#22c55e';
    return '#15803d';
  };
  
  let html = `
    <div class="heatmap-container">
      <table class="heatmap-table">
        <thead>
          <tr>
            <th>Team</th>
            ${phases.map(p => `<th>${p.substring(0, 4)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  teams.forEach(team => {
    html += `<tr><td>${team}</td>`;
    phases.forEach(phase => {
      const val = heatmapData[team][phase];
      const color = getHeatColor(val);
      html += `<td><div class="heatmap-cell" style="background: ${color};">${val}</div></td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ===== 4. TREND SPARKLINES =====
function renderTrendSparklines(container) {
  const events = applySidebarFiltersToEvents(clinicalEventsData?.events || []);
  const teams = ['MD', 'RN', 'PT', 'OT', 'SLP', 'SW'];
  const phases = ['Home', 'ER', 'Unit', 'Discharge', 'Post-Discharge'];
  const teamColors = DISCIPLINE_COLORS;

  const admitStr = patientData?.basic?.admitDate || '1/10';
  const dischargeStr = patientData?.basic?.dischargeDate || '1/21';
  const admissionDate = parseDateFromText(admitStr) || parsePatientDashboardDate(admitStr);
  const dischargeDate = parseDateFromText(dischargeStr) || parsePatientDashboardDate(dischargeStr);

  if (!admissionDate || !dischargeDate) {
    container.innerHTML =
      '<div class="sparklines-container"><p class="sparkline-empty">Admit/discharge dates missing for sparklines.</p></div>';
    return;
  }

  const dayMs = 86400000;
  const rangeStart = new Date(startOfLocalDay(admissionDate).getTime() - dayMs);
  const rangeEnd = new Date(startOfLocalDay(dischargeDate).getTime() + dayMs);

  const dates = [];
  for (let t = rangeStart.getTime(); t <= rangeEnd.getTime(); t += dayMs) {
    dates.push(startOfLocalDay(new Date(t)));
  }

  const dayIndexFor = (day) => {
    const y = day.getFullYear();
    const m = day.getMonth();
    const da = day.getDate();
    return dates.findIndex(d => d.getFullYear() === y && d.getMonth() === m && d.getDate() === da);
  };

  const teamData = {};
  teams.forEach(team => {
    teamData[team] = dates.map(() => 0);
  });

  events.forEach(event => {
    const phase = event.phase || 'Unit';
    if (!phases.includes(phase)) return;

    const lanes = event.lanes || event.disciplines || [];
    const calDay = eventCalendarDayForSparkline(event, admissionDate, dischargeDate);
    if (!calDay) return;

    const dayIndex = dayIndexFor(calDay);
    if (dayIndex < 0) return;

    lanes.forEach(lane => {
      const laneUpper = lane.toUpperCase();
      const team = teams.find(t => laneUpper === t || laneUpper.includes(t));
      if (team && teamData[team]) {
        teamData[team][dayIndex]++;
      }
    });
  });
  
  // Use a symmetric scale so left/right halves are comparable across teams
  const maxHalfCount = Math.max(
    ...teams.map(team => {
      const data = teamData[team];
      const midPoint = Math.floor(data.length / 2);
      const firstHalf = data.slice(0, midPoint).reduce((a, b) => a + b, 0);
      const secondHalf = data.slice(midPoint).reduce((a, b) => a + b, 0);
      return Math.max(firstHalf, secondHalf);
    }),
    1
  );
  
  let html = '<div class="sparklines-container">';
  
  // Header row
  html += `
    <div class="sparkline-header">
      <span class="header-team">Team</span>
      <span class="header-spacer" aria-hidden="true"></span>
      <span class="header-total">Total</span>
      <span class="header-trend">Trend</span>
    </div>
  `;
  
  teams.forEach(team => {
    const data = teamData[team];
    const total = data.reduce((a, b) => a + b, 0);
    const midPoint = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, midPoint).reduce((a, b) => a + b, 0);
    const secondHalf = data.slice(midPoint).reduce((a, b) => a + b, 0);
    
    // Calculate percentages
    const earlyPct = total > 0 ? Math.round((firstHalf / total) * 100) : 0;
    const latePct = total > 0 ? Math.round((secondHalf / total) * 100) : 0;
    
    const trend = secondHalf > firstHalf ? 'up' : secondHalf < firstHalf ? 'down' : 'stable';
    const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    const trendLabel = trend === 'up' ? 'Ramping Up' : trend === 'down' ? 'Winding Down' : 'Stable';
    const color = teamColors[team];
    
    // Diverging bars (left = early, right = late) scaled symmetrically
    const earlyWidth = Math.max(0, Math.min(100, (firstHalf / maxHalfCount) * 100));
    const lateWidth = Math.max(0, Math.min(100, (secondHalf / maxHalfCount) * 100));
    
    html += `
      <div class="sparkline-row">
        <span class="sparkline-team" style="color: ${color};">${team}</span>
        <div class="distribution-container">
          <div class="distribution-balance">
            <span class="dist-pct dist-pct-left" title="Early (Days 1-6): ${firstHalf} events">${earlyPct}%</span>
            <div class="distribution-half distribution-half-left" title="Early (Days 1-6): ${firstHalf} events (${earlyPct}%)">
              <div class="dist-fill dist-fill-early" style="width: ${earlyWidth}%; background: ${color};"></div>
            </div>
            <div class="distribution-separator" aria-hidden="true"></div>
            <div class="distribution-half distribution-half-right" title="Late (Days 7-12): ${secondHalf} events (${latePct}%)">
              <div class="dist-fill dist-fill-late" style="width: ${lateWidth}%; background: ${color}; opacity: 0.55;"></div>
            </div>
            <span class="dist-pct dist-pct-right" title="Late (Days 7-12): ${secondHalf} events">${latePct}%</span>
          </div>
        </div>
        <span class="sparkline-value">${total}</span>
        <span class="sparkline-trend ${trend}" title="${trendLabel}">${trendIcon}</span>
      </div>
    `;
  });
  
  // Add legend
  html += `
    <div class="sparkline-legend">
      <div class="legend-item"><span class="legend-box solid"></span> Early Stay (Days 1-6)</div>
      <div class="legend-item"><span class="legend-box faded"></span> Late Stay (Days 7-12)</div>
    </div>
  `;
  
  html += '</div>';
  container.innerHTML = html;
}

// Render Daily Clinical Evidence Trend (commented out — view is hidden by default)
function renderEvidenceTrend() {
  /* Daily Clinical Evidence Trend — commented out; to re-enable, remove this comment block,
     restore renderEvidenceTrend() calls in showDashboard, and set 'daily' as selected in index.html
  const container = document.getElementById('evidence-trend-container');
  if (!container) return;
  
  const events = applySidebarFiltersToEvents(clinicalEventsData?.events || []);
  
  // Get date range from patient data
  const admitStr = patientData?.basic?.admitDate || '1/10';
  const dischargeStr = patientData?.basic?.dischargeDate || '1/21';
  
  // Parse dates
  const admitParts = admitStr.split('/');
  const dischargeParts = dischargeStr.split('/');
  const admissionDate = new Date(2022, parseInt(admitParts[0]) - 1, parseInt(admitParts[1]));
  const dischargeDate = new Date(2022, parseInt(dischargeParts[0]) - 1, parseInt(dischargeParts[1]));

  // Keep trend axis fixed to full inpatient window regardless of phase filter.
  const startDate = new Date(admissionDate);
  const endDate = new Date(dischargeDate);
  
  // Generate date range
  const dates = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Categorize events by date and type
  const dailyData = dates.map(date => {
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    return {
      date: dateStr,
      problem: 0,
      treatment: 0,
      test: 0,
      occurrence: 0
    };
  });
  
  // STEP 1: Count entities from origin_notes directly using their ACTUAL dates
  // This gives us accurate per-day counts from the SpanT extractions
  const processedNotes = new Set();
  
  events.forEach(event => {
    if (!event.origin_notes) return;
    
    event.origin_notes.forEach(note => {
      // Skip duplicate notes (same filename)
      if (processedNotes.has(note.filename)) return;
      processedNotes.add(note.filename);
      
      // Get the note's actual date
      if (!note.date) return;
      const noteDate = parseClinicalNoteDateString(note.date);
      if (!noteDate) return;
      // When a phase is selected, only count notes that map to that phase by date.
      if (currentFilters.phase !== 'all') {
        const notePhase = mapDateToPhase(noteDate, admissionDate, dischargeDate);
        if (notePhase !== currentFilters.phase) return;
      }
      const noteDateStr = `${noteDate.getMonth() + 1}/${noteDate.getDate()}`;
      
      const dayData = dailyData.find(d => d.date === noteDateStr);
      if (!dayData) return;
      
      // Use entitiesByType if available (from SpanT extraction)
      if (note.entitiesByType) {
        dayData.problem += (note.entitiesByType.PROBLEM || []).length;
        dayData.treatment += (note.entitiesByType.TREATMENT || []).length;
        dayData.test += (note.entitiesByType.TEST || []).length;
        dayData.occurrence += (note.entitiesByType.OCCURRENCE || []).length;
      }
    });
  });
  
  // STEP 2: For events without origin_notes, use keyword matching with phase-based dates
  const phaseToDateIndex = (phase, totalDays) => {
    const phasePositions = {
      'Home': 0,
      'ER': 0,
      'Unit': Math.floor(totalDays * 0.4),
      'Discharge': Math.floor(totalDays * 0.8),
      'Post-Discharge': totalDays - 1
    };
    return Math.min(phasePositions[phase] || Math.floor(totalDays / 2), totalDays - 1);
  };
  
  events.forEach((event, eventIndex) => {
    // Skip events that have origin_notes (already processed above)
    if (event.origin_notes && event.origin_notes.length > 0) return;
    
    const text = (event.snippet || '').toLowerCase();
    
    // Use phase-based date assignment
    const baseIndex = phaseToDateIndex(event.phase, dailyData.length);
    const offset = eventIndex % 3;
    const finalIndex = Math.min(baseIndex + offset, dailyData.length - 1);
    const dayData = dailyData[finalIndex];
    
    if (dayData) {
      if (text.includes('problem') || text.includes('diagnos') || text.includes('pain') || 
          text.includes('risk') || text.includes('fracture') || text.includes('injury')) {
        dayData.problem++;
      }
      if (text.includes('treatment') || text.includes('therapy') || text.includes('medic') || 
          text.includes('exercise') || text.includes('mobility')) {
        dayData.treatment++;
      }
      if (text.includes('test') || text.includes('lab') || text.includes('xr') || 
          text.includes('result') || text.includes('imaging')) {
        dayData.test++;
      }
      if (text.includes('progress') || text.includes('assess') || text.includes('monitor') || 
          text.includes('status') || text.includes('goal')) {
        dayData.occurrence++;
      }
    }
  });
  
  // Get active categories based on filter checkboxes
  const allCategories = ['problem', 'treatment', 'test', 'occurrence'];
  const activeCategories = allCategories.filter(cat => currentFilters.categories[cat]);
  
  // If no categories selected, show nothing
  if (activeCategories.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:20px;font-size:0.8rem;">No categories selected</div>';
    return;
  }
  
  // Zero out unselected categories in dailyData
  dailyData.forEach(day => {
    allCategories.forEach(cat => {
      if (!currentFilters.categories[cat]) {
        day[cat] = 0;
      }
    });
  });
  
  // Create stacked bar chart using D3
  const margin = { top: 20, right: 10, bottom: 40, left: 40 };
  const width = container.clientWidth - margin.left - margin.right;
  const height = (container.clientHeight || 200) - margin.top - margin.bottom;
  
  container.innerHTML = '';
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Add legend as HTML overlay - only show active categories
  const legendDiv = document.createElement('div');
  legendDiv.className = 'trend-legend-overlay';
  let legendHtml = '';
  if (currentFilters.categories.problem) legendHtml += `<div class="trend-legend-item"><span class="trend-legend-color" style="background:${EVIDENCE_PANEL_COLORS.problem}"></span>Problem</div>`;
  if (currentFilters.categories.treatment) legendHtml += `<div class="trend-legend-item"><span class="trend-legend-color" style="background:${EVIDENCE_PANEL_COLORS.treatment}"></span>Treatment</div>`;
  if (currentFilters.categories.test) legendHtml += `<div class="trend-legend-item"><span class="trend-legend-color" style="background:${EVIDENCE_PANEL_COLORS.test}"></span>Test</div>`;
  if (currentFilters.categories.occurrence) legendHtml += `<div class="trend-legend-item"><span class="trend-legend-color" style="background:${EVIDENCE_PANEL_COLORS.occurrence}"></span>Occurrence</div>`;
  legendDiv.innerHTML = legendHtml;
  container.appendChild(legendDiv);
  
  // Scales
  const x = d3.scaleBand()
    .domain(dailyData.map(d => d.date))
    .range([0, width])
    .padding(0.2);
  
  // Calculate max Y based only on active categories
  const maxY = d3.max(dailyData, d => {
    let sum = 0;
    activeCategories.forEach(cat => sum += d[cat]);
    return sum;
  }) || 8;
  const y = d3.scaleLinear()
    .domain([0, Math.max(maxY + 1, 8)])
    .range([height, 0]);
  
  // Only use active categories for stacking
  const categories = activeCategories;
  const colors = { ...EVIDENCE_PANEL_COLORS };
  
  // Stack data
  const stack = d3.stack().keys(categories);
  const stackedData = stack(dailyData);
  
  // Draw bars
  svg.selectAll('.layer')
    .data(stackedData)
    .enter()
    .append('g')
    .attr('class', 'layer')
    .attr('fill', d => colors[d.key])
    .selectAll('rect')
    .data(d => d)
    .enter()
    .append('rect')
    .attr('x', d => x(d.data.date))
    .attr('y', d => y(d[1]))
    .attr('height', d => y(d[0]) - y(d[1]))
    .attr('width', x.bandwidth())
    .attr('rx', 2);
  
  // X axis
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-45)')
    .style('text-anchor', 'end')
    .style('font-size', '13px');
  
  // Y axis
  svg.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text')
    .style('font-size', '13px');
  
  // Y axis label
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 8)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .text('Event Count');
  
  // X axis label
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 5)
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .text('Date');
  */
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing...');
  
  // Show welcome page by default
  showWelcomePage();
  
  // Verify functions are accessible
  console.log('handleSelectPatient available:', typeof window.handleSelectPatient);
  console.log('handleBackToWelcome available:', typeof window.handleBackToWelcome);
  
  // Also add event listeners as backup (in addition to onclick handlers)
  const patient1Btn = document.querySelector('.patient-button-1');
  const patient2Btn = document.querySelector('.patient-button-2');
  
  if (patient1Btn) {
    patient1Btn.addEventListener('click', () => {
      console.log('Patient 1 button clicked (via event listener)');
      window.handleSelectPatient(1);
    });
  }
  
  if (patient2Btn) {
    patient2Btn.addEventListener('click', () => {
      console.log('Patient 2 button clicked (via event listener)');
      window.handleSelectPatient(2);
    });
  }
  
  // Window resize handler
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (currentPatient && patientData) {
        renderTimeline();
        renderLogistics();
        renderRiskTrend();
        renderRadarChart();
      }
    }, 250);
  });
  
  console.log('Initialization complete');
});

