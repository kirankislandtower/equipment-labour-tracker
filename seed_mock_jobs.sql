-- Seed the jobs table with the mock job catalogue used by the entry forms.
-- Uses the exact same id values as mock_jobs.json, since the app sends these ids directly
-- as job_id on submit. Safe to re-run (skips ids that already exist).

-- job_name was VARCHAR(255); some real contract names run up to 386 characters.
ALTER TABLE public.jobs ALTER COLUMN job_name TYPE TEXT;

INSERT INTO public.jobs (id, job_number, job_name, location)
VALUES
  ('75411606-1df8-49be-bd06-c13693978099', '1513/23', 'PR-528, 3 year Call on contract -Network', 'N/A'),
  ('635688c3-73f6-420c-a3ac-9f873a40cb6d', '1665/25', 'District Cooling Plant - Extension of EBF Chilled Water Network @ Emaar Beach Front', 'Emaar Beach Front'),
  ('517399fd-7477-4f09-b87f-d3bfe1331811', '1675/25', 'EMP-068-TR-515 - Construction, Completion and Maintenance, in the Defects Liability Period, of the Chilled Water Piping Network Extension to Plot 6723163 at DSP. 1. Variation 01 - Section 4 - Upgradaton of 1 No. ETS Room at Plot 3925327 in JBR. 2. Variation 01 - Section 3 - Construction of ETS Room on Plot 6757644 (SC-S-005 Samana Studio Holding Limited) (358 TR) at Dubai Studio City', 'DSP, JBR, Dubai Studio City'),
  ('b55b92e0-9d9f-4f22-8e61-04a8337b0cf2', '1677/25', 'Chilled Water Network - Plot Connection for 15.0002, 18.0001, 19.0001C & 19.0001D (Design and Build)', 'Plot 15.0002, Plot 18.0001, Plot 19.0001C, Plot 19.0001D'),
  ('8c15f1f8-22fe-4dbb-9837-420dc1986467', '1678/25', 'EMP-048-TR-509 - Construction, Completion and Maintenance, in the Defects Liability Period, of the Chilled Water Piping Network Extensions to Plot JVC11UMRP100 at JVC, Plot DHC2.B.OS.04 at DHCC II and Plot 3347356 at Satwa', 'JVC11UMRP100, DHC2.B.OS.04, SATWA'),
  ('aaffc3ab-f1f0-4130-a2e5-755faea29aa6', '1682/25', 'Extension of Chilled Water Pipe from the Existing Empower Pipeline Network to the Building Plot No.JVC12AHRG001A', 'JVC12AHRG001A'),
  ('f9897125-980d-4291-a05d-06bf6a98c725', '1684/26', 'EPC of Underground Chilled Water Piping Network Extension for Golf Green Buildings at Damac Hills Dubai', 'Damac Hills'),
  ('d740e757-af2f-44c6-b1fc-fa7c70916675', '1685/26', 'EPC of Underground Chilled Water Piping Network Extension for South Avenue Residential Mirdiff', 'Mirdiff'),
  ('cb348a3b-5589-4f11-b7f2-2ec900c75334', '1686/26', 'EMP-031-TR-505-Construct, Complete and Maintain during the Defects Liability Period of Chilled Water Piping Network to "Zenica Property Development" in TECOM A (Plot A-001-003 / 3827585) and "MAG" at City of Arabia (Plot 6466970).', 'TECOM A, City of Arabia'),
  ('e88e94db-1827-4512-b546-306419b3adad', '1688/26', 'Chilled Water Network Connection Works for various plots at Dubai South- Plot AC-6-34 - Aerospace - Plot AC-C42 - MARS - Plot AC-F18 - Flydubai - Plot AC-F15 - UUDS - Plot AC-C62 - LMU 1 IVC D-6 REPAIR WORKS Variation 01-Chilled Water Network bypass loop rectification works at Residential District', 'Plot AC-6-34 - Aerospace, Plot AC-C42 - MARS, Plot AC-F18 - Flydubai, Plot AC-F15 - UUDS, Plot AC-C62 - LMU 1'),
  ('5fce7c89-9325-4dd7-a504-124052d6c735', '1697/26', 'EPC of Underground Chilled Water Piping Network Extension for Al Shirawi Warehouse on plot 597-4877@ DIP2', 'DIP2'),
  ('04d738be-c21a-4e91-bfac-8ee5d0e80631', '1701/26', 'Supply, execution, connection, testing and commissioning of utility works for EMPOWER Chilled Water networks - R1122/3 Construction of Roads and Bridges on Al Fai Road (Phase 1)', 'Al Fai Road'),
  ('ec8f1a31-594d-4d5b-afe1-f4bdb102fa8c', '1705/26', 'TR 517- Construction, Completion & Maintenance of Chilled Water Network Plot Connections of PJCRC15-16B and PJCRC300 in Palm Jumeirah Crescent, 3466814 and 3460687 in Business Bay. 1. Variation 01 - Extension of Chilled Water Network to JVT Al Khail Avenue Mall', 'Palm Jumeirah Crescent, Business Bay, JVT Al Khail Avenue Mall'),
  ('a4e271a5-ae81-408c-aaed-79609be7a5c5', '1707/26', 'TSE Valve Chamber Upgradation Works at Dubai South', 'Dubai South'),
  ('79b4cf29-e48a-4625-8d18-fe34454846c7', '1708/26', 'EMP-068-TR-520 - Construction, Completion and Maintenance in the Defects Liability Period of the Chilled Water Piping Network Extension to Plot 6723164 and Plot 6723167 at DSP', 'DSP'),
  ('4756ee92-5521-4232-bf27-ce2d5390b6e8', '1709/26', 'Emaar Beachfront - Modification of roads, infrastructure, security, and landscape (The bristol project connection)', 'Emaar Beach Front'),
  ('f0235972-a443-4904-8fd2-9f9ded9e2845', '1715/26', 'Trial Pits to Expose Existing District Cooling Chilled Water Pipe Outside Plot JVT01FTCP002 - GPRC-25-510-OBJECT 36-ELARIS AXIS-NEXA-PLOT NO. 6848868-JVT', 'JVT')
ON CONFLICT (id) DO NOTHING;
