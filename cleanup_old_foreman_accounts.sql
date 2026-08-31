-- Run this in the Supabase SQL Editor.
-- Removes the old long-username foreman accounts that were replaced by shorter
-- first-name-only usernames (e.g. sunilsurendran@islandtower.local -> sunil@islandtower.local).
-- Deletes both the auth.users login and the public.users profile row for each,
-- since public.users has no cascading FK back to auth.users.
-- Safe to re-run (a second run just matches zero rows).

DELETE FROM public.users WHERE email IN (
  'sunilsurendran@islandtower.local',
  'sreejithjanardhanan@islandtower.local',
  'anilkumark@islandtower.local',
  'mallickanadicharan@islandtower.local',
  'chandraseskharkumar@islandtower.local',
  'balwindersingh@islandtower.local',
  'shabeerkhanmohammed@islandtower.local',
  'anilkumarts@islandtower.local',
  'satnamsingh@islandtower.local',
  'karticksarkar@islandtower.local',
  'iftekharahmad@islandtower.local',
  'sureshkumargopalan@islandtower.local',
  'rabindrakumaryadav@islandtower.local',
  'naveenkumar@islandtower.local',
  'aneeshkumarkgopalakrishnannair@islandtower.local',
  'sushantbehera@islandtower.local',
  'mdirshadahmad@islandtower.local'
);

DELETE FROM auth.users WHERE email IN (
  'sunilsurendran@islandtower.local',
  'sreejithjanardhanan@islandtower.local',
  'anilkumark@islandtower.local',
  'mallickanadicharan@islandtower.local',
  'chandraseskharkumar@islandtower.local',
  'balwindersingh@islandtower.local',
  'shabeerkhanmohammed@islandtower.local',
  'anilkumarts@islandtower.local',
  'satnamsingh@islandtower.local',
  'karticksarkar@islandtower.local',
  'iftekharahmad@islandtower.local',
  'sureshkumargopalan@islandtower.local',
  'rabindrakumaryadav@islandtower.local',
  'naveenkumar@islandtower.local',
  'aneeshkumarkgopalakrishnannair@islandtower.local',
  'sushantbehera@islandtower.local',
  'mdirshadahmad@islandtower.local'
);
