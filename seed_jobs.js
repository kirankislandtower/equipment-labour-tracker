const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const jobs = [
  { job_number: "1513/23", job_name: "PR-528, 3 year Call on contract -Network", location: "N/A" },
  { job_number: "1665/25", job_name: "District Cooling Plant - Extension of EBF Chilled Water Network @ Emaar Beach Front", location: "Emaar Beach Front" },
  { job_number: "1675/25", job_name: "EMP-068-TR-515 - Construction, Completion and Maintenance, in the Defects Liability Period, of the Chilled Water Piping Network Extension to Plot 6723163 at DSP. 1. Variation 01 - Section 4 - Upgradaton of 1 No. ETS Room at Plot 3925327 in JBR. 2. Variation 01 - Section 3 - Construction of ETS Room on Plot 6757644 (SC-S-005 Samana Studio Holding Limited) (358 TR) at Dubai Studio City", location: "DSP, JBR, Dubai Studio City" },
  { job_number: "1677/25", job_name: "Chilled Water Network - Plot Connection for 15.0002, 18.0001, 19.0001C & 19.0001D (Design and Build)", location: "Plot 15.0002, Plot 18.0001, Plot 19.0001C, Plot 19.0001D" },
  { job_number: "1678/25", job_name: "EMP-048-TR-509 - Construction, Completion and Maintenance, in the Defects Liability Period, of the Chilled Water Piping Network Extensions to Plot JVC11UMRP100 at JVC, Plot DHC2.B.OS.04 at DHCC II and Plot 3347356 at Satwa", location: "JVC11UMRP100, DHC2.B.OS.04, SATWA" },
  { job_number: "1682/25", job_name: "Extension of Chilled Water Pipe from the Existing Empower Pipeline Network to the Building Plot No.JVC12AHRG001A", location: "JVC12AHRG001A" },
  { job_number: "1684/26", job_name: "EPC of Underground Chilled Water Piping Network Extension for Golf Green Buildings at Damac Hills Dubai", location: "Damac Hills" },
  { job_number: "1685/26", job_name: "EPC of Underground Chilled Water Piping Network Extension for South Avenue Residential Mirdiff", location: "Mirdiff" },
  { job_number: "1686/26", job_name: "EMP-031-TR-505-Construct, Complete and Maintain during the Defects Liability Period of Chilled Water Piping Network to \"Zenica Property Development\" in TECOM A (Plot A-001-003 / 3827585) and \"MAG\" at City of Arabia (Plot 6466970).", location: "TECOM A, City of Arabia" },
  { job_number: "1688/26", job_name: "Chilled Water Network Connection Works for various plots at Dubai South- Plot AC-6-34 - Aerospace - Plot AC-C42 - MARS - Plot AC-F18 - Flydubai - Plot AC-F15 - UUDS - Plot AC-C62 - LMU 1 IVC D-6 REPAIR WORKS Variation 01-Chilled Water Network bypass loop rectification works at Residential District", location: "Plot AC-6-34 - Aerospace, Plot AC-C42 - MARS, Plot AC-F18 - Flydubai, Plot AC-F15 - UUDS, Plot AC-C62 - LMU 1" },
  { job_number: "1697/26", job_name: "EPC of Underground Chilled Water Piping Network Extension for Al Shirawi Warehouse on plot 597-4877@ DIP2", location: "DIP2" },
  { job_number: "1701/26", job_name: "Supply, execution, connection, testing and commissioning of utility works for EMPOWER Chilled Water networks - R1122/3 Construction of Roads and Bridges on Al Fai Road (Phase 1)", location: "Al Fai Road" },
  { job_number: "1705/26", job_name: "TR 517- Construction, Completion & Maintenance of Chilled Water Network Plot Connections of PJCRC15-16B and PJCRC300 in Palm Jumeirah Crescent, 3466814 and 3460687 in Business Bay. 1. Variation 01 - Extension of Chilled Water Network to JVT Al Khail Avenue Mall", location: "Palm Jumeirah Crescent, Business Bay, JVT Al Khail Avenue Mall" },
  { job_number: "1707/26", job_name: "TSE Valve Chamber Upgradation Works at Dubai South", location: "Dubai South" },
  { job_number: "1708/26", job_name: "EMP-068-TR-520 - Construction, Completion and Maintenance in the Defects Liability Period of the Chilled Water Piping Network Extension to Plot 6723164 and Plot 6723167 at DSP", location: "DSP" },
  { job_number: "1709/26", job_name: "Emaar Beachfront - Modification of roads, infrastructure, security, and landscape (The bristol project connection)", location: "Emaar Beach Front" },
  { job_number: "1715/26", job_name: "Trial Pits to Expose Existing District Cooling Chilled Water Pipe Outside Plot JVT01FTCP002 - GPRC-25-510-OBJECT 36-ELARIS AXIS-NEXA-PLOT NO. 6848868-JVT", location: "JVT" }
];

async function seedJobs() {
  const { data, error } = await supabase.from('jobs').upsert(
    jobs.map(job => ({
      job_number: job.job_number,
      // Truncate to 255 chars to avoid postgres character varying(255) error
      job_name: job.job_name.length > 255 ? job.job_name.substring(0, 252) + '...' : job.job_name,
      location: job.location,
      is_active: true
    })),
    { onConflict: 'job_number' }
  );

  if (error) {
    console.error('Error inserting jobs:', error);
  } else {
    console.log('Successfully inserted/updated jobs:', jobs.length);
  }
}

seedJobs();
