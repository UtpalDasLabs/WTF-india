
CREATE TYPE public.app_role AS ENUM ('admin','reviewer','user');
CREATE TYPE public.project_status AS ENUM ('planned','ongoing','delayed','completed','finished_early');
CREATE TYPE public.verify_status AS ENUM ('unverified','pending_review','verified','rejected');
CREATE TYPE public.source_type AS ENUM ('government_portal','tender_document','budget_document','press_release','audit_report','news_report','rti_response');
CREATE TYPE public.moderation_state AS ENUM ('visible','held','blurred','removed');
CREATE TYPE public.candidate_state AS ENUM ('discovered','in_review','approved','rejected');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "own profile write" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','reviewer'))
$$;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_reviewer(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plain_summary text NOT NULL,
  details text,
  department text,
  sector text,
  state text,
  district text,
  latitude double precision,
  longitude double precision,
  budget_inr numeric,
  status public.project_status NOT NULL DEFAULT 'planned',
  start_date date,
  planned_end_date date,
  actual_end_date date,
  verification_status public.verify_status NOT NULL DEFAULT 'pending_review',
  confidence numeric NOT NULL DEFAULT 0,
  last_verified_at timestamptz,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT ON public.projects TO anon;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published projects readable" ON public.projects FOR SELECT USING (published = true OR public.is_reviewer(auth.uid()));
CREATE POLICY "reviewers manage projects" ON public.projects FOR ALL TO authenticated USING (public.is_reviewer(auth.uid())) WITH CHECK (public.is_reviewer(auth.uid()));
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.project_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  publisher text,
  source_type public.source_type NOT NULL,
  verification_status public.verify_status NOT NULL DEFAULT 'pending_review',
  confidence numeric NOT NULL DEFAULT 0,
  last_verified_at timestamptz,
  extracted_evidence text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_sources TO authenticated;
GRANT SELECT ON public.project_sources TO anon;
GRANT ALL ON public.project_sources TO service_role;
ALTER TABLE public.project_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources readable" ON public.project_sources FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.published OR public.is_reviewer(auth.uid()))));
CREATE POLICY "reviewers manage sources" ON public.project_sources FOR ALL TO authenticated USING (public.is_reviewer(auth.uid())) WITH CHECK (public.is_reviewer(auth.uid()));

CREATE TABLE public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date date,
  is_verified boolean NOT NULL DEFAULT false,
  source_id uuid REFERENCES public.project_sources ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT SELECT ON public.project_milestones TO anon;
GRANT ALL ON public.project_milestones TO service_role;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "milestones readable" ON public.project_milestones FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND (p.published OR public.is_reviewer(auth.uid()))));
CREATE POLICY "reviewers manage milestones" ON public.project_milestones FOR ALL TO authenticated USING (public.is_reviewer(auth.uid())) WITH CHECK (public.is_reviewer(auth.uid()));

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  author_name text,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text,
  masked_body text,
  moderation_label text,
  moderation_state public.moderation_state NOT NULL DEFAULT 'visible',
  moderation_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visible reviews readable" ON public.reviews FOR SELECT USING (moderation_state = 'visible' OR user_id = auth.uid() OR public.is_reviewer(auth.uid()));
CREATE POLICY "own reviews insert" ON public.reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own reviews update" ON public.reviews FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_reviewer(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_reviewer(auth.uid()));
CREATE POLICY "own reviews delete" ON public.reviews FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_reviewer(auth.uid()));

CREATE TABLE public.review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  image_url text NOT NULL,
  caption text,
  moderation_label text,
  moderation_state public.moderation_state NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_images TO authenticated;
GRANT SELECT ON public.review_images TO anon;
GRANT ALL ON public.review_images TO service_role;
ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visible images readable" ON public.review_images FOR SELECT USING (moderation_state IN ('visible','blurred') OR user_id = auth.uid() OR public.is_reviewer(auth.uid()));
CREATE POLICY "own images insert" ON public.review_images FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own images update" ON public.review_images FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_reviewer(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_reviewer(auth.uid()));
CREATE POLICY "own images delete" ON public.review_images FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_reviewer(auth.uid()));

CREATE TABLE public.candidate_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plain_summary text,
  department text,
  state text,
  district text,
  proposed_status public.project_status,
  budget_inr numeric,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_confidence numeric NOT NULL DEFAULT 0,
  agent_notes text,
  discovered_from text,
  review_state public.candidate_state NOT NULL DEFAULT 'discovered',
  reviewer_id uuid REFERENCES auth.users ON DELETE SET NULL,
  reviewer_notes text,
  published_project_id uuid REFERENCES public.projects ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_projects TO authenticated;
GRANT ALL ON public.candidate_projects TO service_role;
ALTER TABLE public.candidate_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviewers manage candidates" ON public.candidate_projects FOR ALL TO authenticated USING (public.is_reviewer(auth.uid())) WITH CHECK (public.is_reviewer(auth.uid()));
CREATE TRIGGER candidates_touch BEFORE UPDATE ON public.candidate_projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.projects (id, name, plain_summary, details, department, sector, state, district, latitude, longitude, budget_inr, status, start_date, planned_end_date, actual_end_date, verification_status, confidence, last_verified_at, published) VALUES
('11111111-1111-1111-1111-111111111101','Mumbai Coastal Road (South) Phase 1','A 10.6 km coastal road along the western shore of South Mumbai, built to cut travel time between Marine Drive and Worli.','The road includes twin tunnels under Malabar Hill, sea walls, interchanges and reclaimed land for public parks. Most sections are open to traffic; some connectors and the promenade work continue.','Brihanmumbai Municipal Corporation','Roads and transport','Maharashtra','Mumbai',18.9600,72.8100,137000000000,'ongoing','2018-10-13','2024-11-30',NULL,'verified',0.92,'2026-08-20',true),
('11111111-1111-1111-1111-111111111102','Chennai Metro Phase 2 Corridor 4 (Light House to Poonamallee)','A 26 km metro line planned to connect the city centre near Light House with Poonamallee in the west.','Work covers underground stations in the core city and elevated stations further out. Tunnelling and station box construction are in progress, with staged openings expected.','Chennai Metro Rail Limited','Urban rail','Tamil Nadu','Chennai',13.0400,80.2300,63000000000,'delayed','2021-01-20','2026-03-31',NULL,'verified',0.86,'2026-08-12',true),
('11111111-1111-1111-1111-111111111103','Delhi Dwarka Expressway (Delhi section)','A 29 km access-controlled expressway linking Dwarka in Delhi with Gurugram, easing pressure on the old Delhi-Gurugram highway.','The Delhi stretch includes an elevated section and a shallow tunnel near the airport link. The Haryana part opened earlier; the Delhi part opened in stages.','National Highways Authority of India','Roads and transport','Delhi','South West Delhi',28.5600,77.0400,91000000000,'completed','2019-06-01','2023-12-31','2025-05-20','verified',0.9,'2026-07-30',true),
('11111111-1111-1111-1111-111111111104','Bengaluru Suburban Rail Corridor 2 (Baiyappanahalli to Chikkabanavara)','A 25 km suburban rail corridor planned to move commuters across Bengaluru without using the crowded main lines.','Includes new stations, dedicated tracks alongside existing railway land, and links to metro stations. Land handover and civil works are the current focus.','Rail Infrastructure Development Company (Karnataka)','Suburban rail','Karnataka','Bengaluru Urban',13.0100,77.6400,45000000000,'planned','2024-02-15','2029-12-31',NULL,'pending_review',0.61,'2026-06-18',true),
('11111111-1111-1111-1111-111111111105','Jal Jeevan Mission piped water scheme, Barmer block','Household tap water connections for villages in Barmer block, replacing long walks to distant wells and tankers.','Work includes overhead tanks, pump houses and a village distribution network. Several panchayats were finished ahead of schedule after pipeline material arrived early.','Public Health Engineering Department, Rajasthan','Water supply','Rajasthan','Barmer',25.7500,71.3900,2800000000,'finished_early','2022-04-01','2025-03-31','2024-09-15','verified',0.83,'2026-08-02',true),
('11111111-1111-1111-1111-111111111106','Purvanchal Link Expressway upgrade, Ghazipur segment','Widening and resurfacing of a 42 km segment, plus new service roads and safer village crossings.','The segment adds two lanes, foot overbridges near schools, and lighting at junctions. Contractor mobilisation was slow and land disputes pushed the schedule.','Uttar Pradesh Expressways Industrial Development Authority','Roads and transport','Uttar Pradesh','Ghazipur',25.5800,83.5800,14500000000,'delayed','2023-07-10','2025-12-31',NULL,'verified',0.74,'2026-05-22',true),
('11111111-1111-1111-1111-111111111107','Kochi Water Metro extension to Vypin and Fort Kochi','New electric ferry jetties and boats connecting island neighbourhoods to the mainland.','Includes battery-electric catamarans, jetty upgrades with step-free access, and a shared ticket with city buses.','Kochi Metro Rail Limited','Water transport','Kerala','Ernakulam',9.9700,76.2700,7400000000,'ongoing','2023-04-25','2027-03-31',NULL,'verified',0.88,'2026-08-15',true),
('11111111-1111-1111-1111-111111111108','District Hospital upgrade, Nagaon, 300 beds','Expansion of the district hospital with new wards, an intensive care block and a dialysis unit.','The upgrade adds oxygen pipelines, a maternity wing and staff quarters. Building work is complete; equipment installation and staffing are being finished.','National Health Mission, Assam','Health','Assam','Nagaon',26.3500,92.6800,1900000000,'completed','2021-11-05','2024-12-31','2025-02-28','verified',0.8,'2026-07-11',true);

INSERT INTO public.project_sources (project_id, title, url, publisher, source_type, verification_status, confidence, last_verified_at, extracted_evidence) VALUES
('11111111-1111-1111-1111-111111111101','Coastal Road Project official page','https://portal.mcgm.gov.in/','Brihanmumbai Municipal Corporation','government_portal','verified',0.95,'2026-08-20','Project length 10.58 km from Princess Street Flyover to the Bandra-Worli Sea Link, with twin tunnels of 2.07 km each.'),
('11111111-1111-1111-1111-111111111101','Municipal budget allocation for coastal road','https://portal.mcgm.gov.in/irj/portal/anonymous/qlbudget','Brihanmumbai Municipal Corporation','budget_document','verified',0.9,'2026-08-18','Capital provision for the Coastal Road works listed under the civic capital budget head for the financial year.'),
('11111111-1111-1111-1111-111111111102','Chennai Metro Phase 2 project details','https://chennaimetrorail.org/','Chennai Metro Rail Limited','government_portal','verified',0.9,'2026-08-12','Corridor 4 runs 26.1 km between Light House and Poonamallee Bypass with 28 stations.'),
('11111111-1111-1111-1111-111111111102','Tender notice for tunnelling package','https://chennaimetrorail.org/tenders/','Chennai Metro Rail Limited','tender_document','pending_review',0.65,'2026-07-28','Tender for the underground package includes twin tunnels and cut-and-cover station boxes in the city centre.'),
('11111111-1111-1111-1111-111111111103','NHAI project status for Dwarka Expressway','https://nhai.gov.in/','National Highways Authority of India','government_portal','verified',0.93,'2026-07-30','Dwarka Expressway total length 29.06 km, of which 18.9 km lies in Haryana and 10.1 km in Delhi.'),
('11111111-1111-1111-1111-111111111103','Press release on opening of the Delhi section','https://pib.gov.in/','Press Information Bureau','press_release','verified',0.88,'2026-07-30','The Delhi section of the Dwarka Expressway was declared open for public traffic.'),
('11111111-1111-1111-1111-111111111104','Karnataka suburban rail corridor overview','https://kride.in/','Rail Infrastructure Development Company (Karnataka)','government_portal','pending_review',0.6,'2026-06-18','Corridor 2, the Mallige line, spans about 25 km with 14 stations between Baiyappanahalli and Chikkabanavara.'),
('11111111-1111-1111-1111-111111111105','Jal Jeevan Mission district dashboard','https://ejalshakti.gov.in/','Ministry of Jal Shakti','government_portal','verified',0.85,'2026-08-02','District level reporting shows household tap connection coverage for Barmer block above the target for the period.'),
('11111111-1111-1111-1111-111111111105','State audit note on scheme completion','https://cag.gov.in/','Comptroller and Auditor General of India','audit_report','verified',0.8,'2026-07-20','Audit observed that several panchayat level works were certified complete before the scheduled date.'),
('11111111-1111-1111-1111-111111111106','Expressway authority works status','https://upeida.up.gov.in/','Uttar Pradesh Expressways Industrial Development Authority','government_portal','verified',0.75,'2026-05-22','Segment works reported partially complete with revised milestone dates recorded for the Ghazipur stretch.'),
('11111111-1111-1111-1111-111111111106','Reporting on land dispute delays','https://pib.gov.in/','Press Information Bureau','news_report','pending_review',0.5,'2026-05-10','Reporting refers to pending land handover affecting service road construction.'),
('11111111-1111-1111-1111-111111111107','Kochi Water Metro official route information','https://kochimetro.org/','Kochi Metro Rail Limited','government_portal','verified',0.9,'2026-08-15','Water Metro operates battery-electric boats serving island terminals with step-free jetty access.'),
('11111111-1111-1111-1111-111111111108','National Health Mission Assam project list','https://nhm.assam.gov.in/','National Health Mission, Assam','government_portal','verified',0.82,'2026-07-11','District hospital upgrade sanctioned for 300 beds including intensive care and dialysis facilities.');

INSERT INTO public.project_milestones (project_id, title, description, event_date, is_verified, sort_order) VALUES
('11111111-1111-1111-1111-111111111101','Work started','Foundation stone laid and reclamation began.','2018-10-13',true,1),
('11111111-1111-1111-1111-111111111101','Tunnelling finished','Both tunnels under Malabar Hill were completed.','2022-05-30',true,2),
('11111111-1111-1111-1111-111111111101','South-bound carriageway opened','Traffic allowed from Worli to Marine Drive.','2024-03-11',true,3),
('11111111-1111-1111-1111-111111111101','Promenade and parks pending','Public spaces on reclaimed land still under construction.','2026-08-20',false,4),
('11111111-1111-1111-1111-111111111102','Approval received','Corridor approved and funding tied up.','2021-01-20',true,1),
('11111111-1111-1111-1111-111111111102','Tunnelling began','First tunnel boring machine launched in the city centre.','2023-02-14',true,2),
('11111111-1111-1111-1111-111111111102','Deadline revised','Completion moved later because of utility shifting and traffic diversions.','2025-09-01',true,3),
('11111111-1111-1111-1111-111111111103','Construction started','Work began on the Delhi stretch.','2019-06-01',true,1),
('11111111-1111-1111-1111-111111111103','Haryana section opened','First half opened to traffic.','2024-03-11',true,2),
('11111111-1111-1111-1111-111111111103','Delhi section opened','Full expressway made available to the public.','2025-05-20',true,3),
('11111111-1111-1111-1111-111111111104','Detailed report approved','Alignment and station list finalised.','2024-02-15',true,1),
('11111111-1111-1111-1111-111111111104','Land handover in progress','Railway land transfer under process.','2026-04-10',false,2),
('11111111-1111-1111-1111-111111111105','Scheme sanctioned','Block level plan approved with village lists.','2022-04-01',true,1),
('11111111-1111-1111-1111-111111111105','Pipeline laying finished','Distribution network completed across panchayats.','2024-06-30',true,2),
('11111111-1111-1111-1111-111111111105','Completed ahead of schedule','Work certified complete six months before the deadline.','2024-09-15',true,3),
('11111111-1111-1111-1111-111111111106','Contract awarded','Widening contract signed.','2023-07-10',true,1),
('11111111-1111-1111-1111-111111111106','Work slowed','Land disputes stalled service road work.','2025-02-20',true,2),
('11111111-1111-1111-1111-111111111107','Boats delivered','First set of electric boats handed over.','2023-04-25',true,1),
('11111111-1111-1111-1111-111111111107','Jetty upgrades underway','Vypin and Fort Kochi jetties being rebuilt.','2026-06-01',false,2),
('11111111-1111-1111-1111-111111111108','Construction started','New ward blocks began.','2021-11-05',true,1),
('11111111-1111-1111-1111-111111111108','Building work finished','Structures handed over to the health department.','2024-12-20',true,2),
('11111111-1111-1111-1111-111111111108','Hospital opened','Wards and dialysis unit started serving patients.','2025-02-28',true,3);

INSERT INTO public.reviews (project_id, author_name, rating, body, masked_body, moderation_label, moderation_state) VALUES
('11111111-1111-1111-1111-111111111101','Rohit S.',4,'Travel time from Worli to Marine Drive dropped a lot. Signage near the tunnel entry could be clearer.','Travel time from Worli to Marine Drive dropped a lot. Signage near the tunnel entry could be clearer.','clean','visible'),
('11111111-1111-1111-1111-111111111101','Anonymous',2,'The promenade is still fenced off after all these years, damn frustrating for walkers.','The promenade is still fenced off after all these years, d**n frustrating for walkers.','profanity_masked','visible'),
('11111111-1111-1111-1111-111111111102','Divya R.',2,'Digging near the market has been going on for two years. Shops are losing customers.','Digging near the market has been going on for two years. Shops are losing customers.','clean','visible'),
('11111111-1111-1111-1111-111111111105','Kavita M.',5,'We have a tap at home now. Earlier we walked two kilometres for water.','We have a tap at home now. Earlier we walked two kilometres for water.','clean','visible'),
('11111111-1111-1111-1111-111111111106','Anonymous',1,'Contractor abandoned the site near our village. Dust everywhere and no answers.','Contractor abandoned the site near our village. Dust everywhere and no answers.','possible_unverified_claim','held'),
('11111111-1111-1111-1111-111111111107','Sneha P.',5,'Boats are quiet and on time. Ramp access works well with a wheelchair.','Boats are quiet and on time. Ramp access works well with a wheelchair.','clean','visible'),
('11111111-1111-1111-1111-111111111108','Bhaskar D.',4,'Dialysis unit saves us a long trip to Guwahati. Waiting area gets crowded in the morning.','Dialysis unit saves us a long trip to Guwahati. Waiting area gets crowded in the morning.','clean','visible');

INSERT INTO public.candidate_projects (name, plain_summary, department, state, district, proposed_status, budget_inr, citations, agent_confidence, agent_notes, discovered_from, review_state) VALUES
('Patna Metro Corridor 2 depot and station package','Metro depot and three elevated stations proposed in Patna.','Patna Metro Rail Corporation','Bihar','Patna','ongoing',18500000000,'[{"title":"Patna Metro tender notice","url":"https://pmrcl.co.in/","source_type":"tender_document","evidence":"Tender documents list depot works and three elevated stations for Corridor 2."},{"title":"State budget line item","url":"https://finance.bihar.gov.in/","source_type":"budget_document","evidence":"Budget provision recorded for urban metro works in Patna."}]'::jsonb,0.72,'Two independent official sources agree on scope. Station names need confirmation before publishing.','Central tender portal sweep','discovered'),
('Coimbatore lake restoration, Ukkadam tank','Desilting and bund strengthening for a large city tank.','Coimbatore City Municipal Corporation','Tamil Nadu','Coimbatore','planned',940000000,'[{"title":"Smart City works list","url":"https://coimbatore.nic.in/","source_type":"government_portal","evidence":"Works list mentions restoration of Ukkadam tank with bund strengthening."}]'::jsonb,0.55,'Only one source found so far. Needs a second official document or an audit note.','Municipal portal crawl','in_review'),
('Guwahati flyover at Zoo Road junction','Two-lane flyover proposed to reduce congestion at a busy junction.','Public Works Department, Assam','Assam','Kamrup Metropolitan','planned',2600000000,'[{"title":"PWD annual plan","url":"https://pwd.assam.gov.in/","source_type":"government_portal","evidence":"Annual plan lists a flyover at Zoo Road junction under the urban roads head."},{"title":"News report on approval","url":"https://pib.gov.in/","source_type":"news_report","evidence":"Report mentions administrative approval for the flyover."}]'::jsonb,0.48,'The news source is weak evidence. Hold until a tender or budget document is located.','News monitoring','discovered'),
('Visakhapatnam desalination plant, 20 MLD','Seawater treatment plant proposed to add drinking water supply.','Greater Visakhapatnam Municipal Corporation','Andhra Pradesh','Visakhapatnam','planned',5200000000,'[{"title":"GVMC council resolution","url":"https://gvmc.gov.in/","source_type":"government_portal","evidence":"Council resolution records in-principle approval for a 20 MLD desalination plant."}]'::jsonb,0.4,'Capacity figures vary between documents. Rejected for now, revisit after the tender is published.','Municipal portal crawl','rejected');
