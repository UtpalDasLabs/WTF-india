-- A status for a project nobody has checked yet.
--
-- Community spots arrive as a photograph and a location. Nobody has read a
-- sanction order for them, so every existing status would be a claim we cannot
-- back: "planned" says a government approved it, "ongoing" says work is under
-- way. The dataset's whole argument is that each published figure cites a
-- document, so the honest answer is a status that admits it does not know.
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'unknown';
