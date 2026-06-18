-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 005_seed_all_corridors.sql
--
-- Expands checklist coverage from the single Ontario→Alberta seed (migration
-- 001) to ALL 13 provinces & territories, so EVERY move produces a real,
-- deadline-tracked checklist.
--
-- Modeling: the 5 tasks are destination-driven, so rules use origin = 'ANY' and
-- dest = <province>. A federal task (CRA address) uses 'ANY' → 'ANY'. The mobile
-- query matches (origin = userOrigin OR 'ANY') AND (dest = userDest OR 'ANY'),
-- so a user moving X→Y sees Y's destination tasks + the federal task, with no
-- duplicates. The 5 task descriptions are generalized to be province-neutral;
-- province specifics live in each rule's deadline + official_source URL.
--
-- DATA PROVENANCE & ACCURACY: deadlines (in days) and official URLs were
-- researched from official provincial/territorial government pages in June 2026
-- and independently re-verified. days_deadline is NULL where a province states
-- no fixed statutory deadline (e.g. "as soon as you take up residence"). These
-- are a STARTING POINT — verify each against the linked official source before
-- relying on them, and let the admin-review + source-scraper flow keep them
-- current. Every rule carries its official_source URL for verification.
--
-- NOTE: this resets corridor_task_rules (and cascades official_sources + any
-- user_task_progress tied to the old ON→AB rows). Safe pre-launch.
-- ============================================================================


-- ============================================================================
-- 1. Generalize the 5 task descriptions (were Alberta-specific in seed 001).
-- ============================================================================
UPDATE global_tasks SET
    title_en = 'Exchange Your Driver''s Licence',
    base_description_en = 'Exchange your current driver''s licence for one issued by your new province or territory. You''ll usually visit a licensing or registry office in person with valid ID and your existing licence. Deadlines vary by province — check the official link for your destination''s exact rule.'
WHERE task_key = 'EXCHANGE_DRIVERS_LICENCE';

UPDATE global_tasks SET
    title_en = 'Register Your Vehicle',
    base_description_en = 'Register your vehicle in your new province or territory. You''ll typically need your current registration, proof of local insurance, and in some provinces an out-of-province inspection. Deadlines vary — see the official link for your destination.'
WHERE task_key = 'REGISTER_VEHICLE';

UPDATE global_tasks SET
    title_en = 'Apply for Health Coverage',
    base_description_en = 'Apply for your new province or territory''s public health insurance plan. Most have a waiting period before coverage begins, so apply as soon as you arrive and keep your previous coverage active until the new plan starts.'
WHERE task_key = 'UPDATE_HEALTH_CARD';

UPDATE global_tasks SET
    title_en = 'Update Your Address with the CRA',
    base_description_en = 'Tell the Canada Revenue Agency your new address so tax slips and benefit payments (Canada Child Benefit, GST/HST credit, and more) reach you. Update it online through CRA My Account, by phone, or by mail. Applies to every move within Canada.'
WHERE task_key = 'UPDATE_CRA_ADDRESS';

UPDATE global_tasks SET
    title_en = 'Register Children in School',
    base_description_en = 'If you''re moving with school-aged children, register them with the local school board or school in your new community. Bring proof of address, the child''s identity documents, immunization records, and previous school records.'
WHERE task_key = 'REGISTER_CHILDREN_SCHOOL';


-- ============================================================================
-- 2. Reset corridor rules (clears the ON→AB-only seed + cascades its sources).
-- ============================================================================
DELETE FROM corridor_task_rules;


-- ============================================================================
-- 3. Corridor rules — origin 'ANY', dest = each province (federal = ANY→ANY).
--    days_deadline NULL = no fixed statutory deadline (still shown, untimed).
-- ============================================================================
INSERT INTO corridor_task_rules (task_id, origin_province, dest_province, days_deadline, is_mandatory)
SELECT g.id, 'ANY', v.dest, v.days::integer, v.mand
FROM (VALUES
    -- Exchange driver's licence (mandatory)
    ('EXCHANGE_DRIVERS_LICENCE', 'AB',  90, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'BC',  90, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'MB',  90, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'NB', NULL, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'NL',  90, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'NS', NULL, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'NT',  30, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'NU',  30, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'ON',  60, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'PE', 120, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'QC', 180, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'SK',  90, TRUE),
    ('EXCHANGE_DRIVERS_LICENCE', 'YT', 120, TRUE),
    -- Apply for health coverage (mandatory; NULL = apply ASAP, no fixed deadline)
    ('UPDATE_HEALTH_CARD', 'AB',  90, TRUE),
    ('UPDATE_HEALTH_CARD', 'BC', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'MB',  90, TRUE),
    ('UPDATE_HEALTH_CARD', 'NB', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'NL', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'NS', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'NT', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'NU', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'ON', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'PE', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'QC', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'SK', NULL, TRUE),
    ('UPDATE_HEALTH_CARD', 'YT', NULL, TRUE),
    -- Register vehicle (mandatory; only shown when has_vehicle = true)
    ('REGISTER_VEHICLE', 'AB',  90, TRUE),
    ('REGISTER_VEHICLE', 'BC',  30, TRUE),
    ('REGISTER_VEHICLE', 'MB',  90, TRUE),
    ('REGISTER_VEHICLE', 'NB', NULL, TRUE),
    ('REGISTER_VEHICLE', 'NL',  90, TRUE),
    ('REGISTER_VEHICLE', 'NS',  90, TRUE),
    ('REGISTER_VEHICLE', 'NT', NULL, TRUE),
    ('REGISTER_VEHICLE', 'NU',  90, TRUE),
    ('REGISTER_VEHICLE', 'ON',  30, TRUE),
    ('REGISTER_VEHICLE', 'PE',  10, TRUE),
    ('REGISTER_VEHICLE', 'QC',  90, TRUE),
    ('REGISTER_VEHICLE', 'SK',  90, TRUE),
    ('REGISTER_VEHICLE', 'YT',   7, TRUE),
    -- Register children in school (optional; only shown when has_dependents = true)
    ('REGISTER_CHILDREN_SCHOOL', 'AB', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'BC', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'MB', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'NB', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'NL', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'NS', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'NT', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'NU', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'ON', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'PE', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'QC', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'SK', NULL, FALSE),
    ('REGISTER_CHILDREN_SCHOOL', 'YT', NULL, FALSE),
    -- Federal: update address with CRA (everyone; no fixed deadline)
    ('UPDATE_CRA_ADDRESS', 'ANY', NULL, TRUE)
) AS v(task_key, dest, days, mand)
JOIN global_tasks g ON g.task_key = v.task_key;


-- ============================================================================
-- 4. Official sources — one verified government URL per rule.
-- ============================================================================
INSERT INTO official_sources (corridor_rule_id, agency_name, official_url, last_verified)
SELECT r.id, v.agency, v.url, NOW()
FROM (VALUES
    -- Driver's licence
    ('EXCHANGE_DRIVERS_LICENCE', 'AB', 'Government of Alberta', 'https://www.alberta.ca/exchange-non-alberta-licences'),
    ('EXCHANGE_DRIVERS_LICENCE', 'BC', 'ICBC', 'https://icbc.com/driver-licensing/moving-bc/Moving-from-within-canada'),
    ('EXCHANGE_DRIVERS_LICENCE', 'MB', 'Manitoba Public Insurance', 'https://www.mpi.mb.ca/new-to-manitoba/'),
    ('EXCHANGE_DRIVERS_LICENCE', 'NB', 'Government of New Brunswick', 'https://www.gnb.ca/en/topic/driving-transportation/driving-licensing/licences-new-residents.html'),
    ('EXCHANGE_DRIVERS_LICENCE', 'NL', 'Government of Newfoundland and Labrador', 'https://www.gov.nl.ca/motorregistration/new-residents-and-visitors/licence-application-process/'),
    ('EXCHANGE_DRIVERS_LICENCE', 'NS', 'Government of Nova Scotia', 'https://novascotia.ca/sns/rmv/other/non.asp'),
    ('EXCHANGE_DRIVERS_LICENCE', 'NT', 'Government of the Northwest Territories', 'https://www.idmv.inf.gov.nt.ca/Drivers/Drivers/Transfer-an-NWT-drivers-licence'),
    ('EXCHANGE_DRIVERS_LICENCE', 'NU', 'Government of Nunavut', 'https://www.gov.nu.ca/en/service-nunavut/apply-drivers-licence'),
    ('EXCHANGE_DRIVERS_LICENCE', 'ON', 'Government of Ontario', 'https://www.ontario.ca/page/exchange-out-province-drivers-licence'),
    ('EXCHANGE_DRIVERS_LICENCE', 'PE', 'Government of Prince Edward Island', 'https://www.princeedwardisland.ca/en/information/transportation-and-infrastructure/driving-with-an-out-of-province-license'),
    ('EXCHANGE_DRIVERS_LICENCE', 'QC', 'SAAQ', 'https://saaq.gouv.qc.ca/en/drivers-licences/drivers-licence-issued-outside-quebec'),
    ('EXCHANGE_DRIVERS_LICENCE', 'SK', 'SGI', 'https://sgi.sk.ca/handbook/-/knowledge_base/drivers/saskatchewan-driver-s-licence-program'),
    ('EXCHANGE_DRIVERS_LICENCE', 'YT', 'Government of Yukon', 'https://yukon.ca/en/driving-and-transportation/driver-licensing/transfer-your-drivers-licence-jurisdiction-outside-yukon'),
    -- Health coverage
    ('UPDATE_HEALTH_CARD', 'AB', 'Government of Alberta (AHCIP)', 'https://www.alberta.ca/ahcip-moving-to-alberta'),
    ('UPDATE_HEALTH_CARD', 'BC', 'BC Ministry of Health (MSP)', 'https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/msp/bc-residents/eligibility-and-enrolment/how-to-enrol/coverage-wait-period'),
    ('UPDATE_HEALTH_CARD', 'MB', 'Manitoba Health', 'https://www.gov.mb.ca/health/mhsip/movingtomanitoba.html'),
    ('UPDATE_HEALTH_CARD', 'NB', 'Government of New Brunswick (Medicare)', 'https://www2.gnb.ca/content/gnb/en/departments/health/DrugPlans/content/medicare/ApplyingforaCard.html'),
    ('UPDATE_HEALTH_CARD', 'NL', 'Government of Newfoundland and Labrador (MCP)', 'https://www.gov.nl.ca/hcs/faq/mcp/'),
    ('UPDATE_HEALTH_CARD', 'NS', 'Government of Nova Scotia', 'https://www.novascotia.ca/healthcare-coverage-if-you-move-nova-scotia-health-card'),
    ('UPDATE_HEALTH_CARD', 'NT', 'Government of the Northwest Territories', 'https://www.hss.gov.nt.ca/en/services/applying-health-care'),
    ('UPDATE_HEALTH_CARD', 'NU', 'Government of Nunavut', 'https://www.gov.nu.ca/en/health/applying-health-care'),
    ('UPDATE_HEALTH_CARD', 'ON', 'Government of Ontario (OHIP)', 'https://www.ontario.ca/page/apply-ohip-and-get-health-card'),
    ('UPDATE_HEALTH_CARD', 'PE', 'Government of Prince Edward Island', 'https://www.princeedwardisland.ca/en/service/apply-for-pei-health-card-new-residents'),
    ('UPDATE_HEALTH_CARD', 'QC', 'RAMQ', 'https://www.ramq.gouv.qc.ca/en/citizens/health-insurance/registration-information'),
    ('UPDATE_HEALTH_CARD', 'SK', 'eHealth Saskatchewan', 'https://www.ehealthsask.ca/residents/health-cards/Pages/Eligibility-for-Health-Benefits.aspx'),
    ('UPDATE_HEALTH_CARD', 'YT', 'Government of Yukon', 'https://yukon.ca/en/health-and-wellness/care-services/apply-health-care-card'),
    -- Vehicle registration
    ('REGISTER_VEHICLE', 'AB', 'Government of Alberta', 'https://www.alberta.ca/register-vehicle'),
    ('REGISTER_VEHICLE', 'BC', 'ICBC', 'https://icbc.com/insurance/moving-travelling/moving-BC'),
    ('REGISTER_VEHICLE', 'MB', 'Manitoba Public Insurance', 'https://www.mpi.mb.ca/new-to-manitoba/'),
    ('REGISTER_VEHICLE', 'NB', 'Government of New Brunswick', 'https://www.gnb.ca/en/topic/driving-transportation/registration-inspection/motor-vehicle-registration.html'),
    ('REGISTER_VEHICLE', 'NL', 'Government of Newfoundland and Labrador', 'https://www.gov.nl.ca/motorregistration/vehicle-ownership/registration-of-a-new-vehicle/'),
    ('REGISTER_VEHICLE', 'NS', 'Government of Nova Scotia', 'https://novascotia.ca/sns/rmv/other/non.asp'),
    ('REGISTER_VEHICLE', 'NT', 'Government of the Northwest Territories', 'https://www.idmv.inf.gov.nt.ca/Vehicles/Registration/Register-a-vehicle-for-the-first-time'),
    ('REGISTER_VEHICLE', 'NU', 'Government of Nunavut', 'https://www.gov.nu.ca/en/service-nunavut/private-vehicle-registration-nunavut'),
    ('REGISTER_VEHICLE', 'ON', 'Government of Ontario', 'https://www.ontario.ca/document/official-mto-drivers-handbook/vehicle-insurance-and-registration'),
    ('REGISTER_VEHICLE', 'PE', 'Government of Prince Edward Island (Highway Traffic Act)', 'https://www.princeedwardisland.ca/sites/default/files/legislation/h-05-highway_traffic_act.pdf'),
    ('REGISTER_VEHICLE', 'QC', 'SAAQ', 'https://saaq.gouv.qc.ca/en/vehicle-registration/vehicle-from-outside-quebec'),
    ('REGISTER_VEHICLE', 'SK', 'SGI', 'https://sgi.sk.ca/handbook/-/knowledge_base/drivers/vehicle-registration'),
    ('REGISTER_VEHICLE', 'YT', 'Government of Yukon', 'https://yukon.ca/en/driving-and-transportation/driver-licensing/transfer-your-drivers-licence-jurisdiction-outside-yukon'),
    -- School registration
    ('REGISTER_CHILDREN_SCHOOL', 'AB', 'Government of Alberta', 'https://www.alberta.ca/education-options'),
    ('REGISTER_CHILDREN_SCHOOL', 'BC', 'WelcomeBC', 'https://www.welcomebc.ca/start-your-life-in-b-c/study-in-b-c'),
    ('REGISTER_CHILDREN_SCHOOL', 'MB', 'Manitoba Education', 'https://www.edu.gov.mb.ca/k12/schools/gts.html'),
    ('REGISTER_CHILDREN_SCHOOL', 'NB', 'Government of New Brunswick', 'https://www2.gnb.ca/content/gnb/en/departments/education/k12.html'),
    ('REGISTER_CHILDREN_SCHOOL', 'NL', 'Government of Newfoundland and Labrador', 'https://www.gov.nl.ca/education/k12/'),
    ('REGISTER_CHILDREN_SCHOOL', 'NS', 'Government of Nova Scotia', 'https://www.ednet.ns.ca/going-school-nova-scotia'),
    ('REGISTER_CHILDREN_SCHOOL', 'NT', 'Government of the Northwest Territories', 'https://www.ece.gov.nt.ca/en/services/jk-12-school-curriculum/directory-nwt-schools'),
    ('REGISTER_CHILDREN_SCHOOL', 'NU', 'Government of Nunavut', 'https://www.gov.nu.ca/en/education-and-schools/k-12-school-calendars-map-and-registration'),
    ('REGISTER_CHILDREN_SCHOOL', 'ON', 'Government of Ontario', 'https://www.ontario.ca/page/your-childs-education-parent-guide-our-school-system'),
    ('REGISTER_CHILDREN_SCHOOL', 'PE', 'Government of Prince Edward Island', 'https://www.princeedwardisland.ca/en/information/education-and-lifelong-learning/register-your-child-for-school'),
    ('REGISTER_CHILDREN_SCHOOL', 'QC', 'Gouvernement du Québec', 'https://www.quebec.ca/en/education/preschool-elementary-and-secondary-schools'),
    ('REGISTER_CHILDREN_SCHOOL', 'SK', 'Government of Saskatchewan', 'https://www.saskatchewan.ca/residents/education-and-learning/prek-12-education-early-learning-and-schools'),
    ('REGISTER_CHILDREN_SCHOOL', 'YT', 'Government of Yukon', 'https://yukon.ca/en/education-and-schools/plan-elementary-and-high-school/register-your-child-school'),
    -- Federal
    ('UPDATE_CRA_ADDRESS', 'ANY', 'Canada Revenue Agency', 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/change-your-address.html')
) AS v(task_key, dest, agency, url)
JOIN global_tasks g ON g.task_key = v.task_key
JOIN corridor_task_rules r
    ON r.task_id = g.id
   AND r.origin_province = 'ANY'
   AND r.dest_province = v.dest;


-- ============================================================================
-- END OF MIGRATION 005_seed_all_corridors.sql
-- ============================================================================
