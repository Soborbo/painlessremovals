/**
 * Fallback vacancies — what /jobs shows when the CRM is unreachable.
 *
 * The CRM is the source of truth once it is live; this file is the safety net, and it
 * holds the same two roles so a CRM outage never empties the careers page. Same shape as
 * the CRM payload so the page renders one way only. `id: ''` marks fallback mode: without
 * a posting id there is nothing to forward, so the application takes the email-only path
 * (unchanged behaviour, no lost applicant).
 */

import type { CrmPosting } from './crm';

/** Where applicants are sent instead of an email address (also usable off-site). */
const APPLY_URL = 'https://www.painlessremovals.com/jobs#application-form';

export const FALLBACK_POSTINGS: CrmPosting[] = [
  {
    id: '',
    slug: 'operations-coordinator-remote',
    title: 'Operations Coordinator (Remote)',
    employmentType: 'full_time',
    typeLabel: 'Full-Time · Remote',
    datePosted: '2026-08-01',
    salary: { min: 30000, max: 35000, unit: 'YEAR' },
    remote: true,
    description: `£30,000 – £35,000 per annum, depending on experience · Monday to Friday, 9:00am – 5:00pm (some flexibility required) · Permanent PAYE contract · Fully remote, Bristol-based company

About us
Painless Removals Ltd is a well-established Bristol-based removals company with over 40 years of experience helping people move home and office. We pride ourselves on delivering a stress-free, professional service and have built a strong reputation across Bristol and beyond, reflected in our 4.9 out of 5 Google rating from over 100 reviews. We're a growing business with a close-knit team, and we're looking for the right person to join us in a key operational role.

The role
This is a fully remote position at the heart of our day-to-day operations. You'll be the organisational backbone of the business — making sure the right teams and vehicles are in the right place at the right time, our customers are booked in and looked after, and everything runs smoothly behind the scenes. You'll work closely with our director and sales team, picking up once a customer is ready to be surveyed and seeing them through to completion of their move.

Key responsibilities
· Managing the company diary and availability calendar
· Allocating staff and vehicles to jobs
· Carrying out video surveys with prospective customers to assess volume and requirements
· Preparing and issuing quotes, ready for handover to the sales team
· Booking confirmed jobs and managing all customer communications from acceptance through to move day
· Handling inbound enquiries by phone and email
· Supporting the director with day-to-day operational tasks
· Keeping our operations software (iMove LiveSwitch) and CRM system up to date

What we offer
· Fully remote working
· £30,000 – £35,000 per annum, depending on experience
· Permanent PAYE contract
· A varied and genuinely important role within a growing business
· Supportive team environment
· The opportunity to grow with the company

How to apply
Apply online at ${APPLY_URL} — attach your CV and add a brief note about your relevant experience. We look forward to hearing from you.`,
    requirements: [
      'Experience in removals, logistics, transport coordination or a similar operational role — this is essential',
      'Strong organisational skills, comfortable managing multiple moving parts at once',
      "Confident and personable telephone manner — you'll be the voice of the business for many of our customers",
      'Comfortable working independently and remotely, using your own initiative',
      'Competent with computers and technology',
      'Calm under pressure and able to problem-solve quickly when plans change',
    ],
    questions: [
      {
        key: 'experience_area',
        label: 'Where is your operational experience from?',
        type: 'select',
        options: [
          'Removals',
          'Logistics or transport coordination',
          'Another operations or coordination role',
          'None of these yet',
        ],
        required: true,
      },
      {
        key: 'notice_period',
        label: 'How soon could you start?',
        type: 'select',
        options: [
          'Immediately available',
          'Within 1 week',
          'Within 2 weeks',
          'Within 1 month',
          'More than 1 month',
        ],
        required: true,
      },
      {
        key: 'remote_setup',
        label: 'I have a quiet place to work from home and reliable broadband',
        type: 'checkbox',
        required: false,
      },
    ],
  },
  {
    id: '',
    slug: 'removal-driver-porter',
    title: 'Removal Driver / Porter',
    employmentType: 'full_time',
    typeLabel: 'Full-Time',
    datePosted: '2026-08-01',
    description: `Bristol, reporting to our Filton warehouse · Monday to Saturday, averaging around 150 hours per month · PAYE employed position · Immediate start available

We're looking for a reliable, hardworking Removal Driver / Porter to join our team in Bristol.

This isn't primarily a driving job. You'll typically spend an hour or two each day behind the wheel of one of our Luton vans, with the rest of your day working alongside the removal crew, packing, loading, transporting and setting up our customers' belongings in their new homes or offices.

We're much more interested in finding the right person than someone with years of removals experience. Previous removals or Luton driving experience would be a big advantage, but full training will be provided. What matters most to us is attitude: Painless Removals has built its reputation around making what can be one of the most stressful days in someone's life as painless as possible. That means being friendly, helpful and professional with customers while taking genuine care of their belongings.

You'll need to be reasonably physically fit, as this is a hands-on job involving lifting furniture and boxes, carrying items up and down stairs and working as part of a crew throughout the day.

Your day to day
· Driving our Luton vans
· Loading and unloading customers' belongings
· Protecting and wrapping furniture
· Packing household items
· Dismantling and reassembling furniture
· Completing job paperwork
· Helping keep our vehicles and equipment clean, organised and ready for work

Hours and travel
Our team reports to our Filton, Bristol warehouse each morning. We typically work Monday to Saturday, averaging around 150 hours per month. Most days are roughly 8am–4/5pm, although removals don't always run to a stopwatch, so start and finish times can vary. We also undertake long-distance removals throughout the UK — usually once or twice a month this can involve working away, including destinations such as Cornwall or Scotland. When overnight stays are required, accommodation and associated work expenses are covered by us.

What we offer
· PAYE employed position, including 28 days' annual leave and a workplace pension
· Hours worked above the standard 150 hours per month paid at an additional 25% enhanced rate
· Full training provided
· A clear route to progress into a Team Leader role, running your own removal crew
· Immediate start available

How to apply
Apply online at ${APPLY_URL} — attach your CV if you have one to hand. If you're hardworking, good with people and like the idea of a job where every day is different, we'd like to hear from you.`,
    requirements: [
      'Aged 25 or over, with a full UK driving licence and no more than six points — this is required to drive our vehicles',
      'Experience driving Luton vans or similar larger vehicles preferred, but not essential',
      'Reasonably physically fit — lifting, carrying and stairs are part of every day',
      'Reliable, takes pride in their work and comfortable talking to customers',
      'Happy to work as part of a crew, and to work away overnight once or twice a month',
      'A sense of humour — some days are long and physically demanding',
    ],
    questions: [
      {
        key: 'licence',
        label: 'What type of driving licence do you hold?',
        type: 'select',
        options: ['None', 'Category B (car and van)', 'Category C1', 'Category C', 'Category C+E'],
        required: true,
      },
      {
        key: 'age_25',
        label: 'I am 25 or over (required to drive our vans)',
        type: 'checkbox',
        required: true,
      },
      {
        key: 'penalty_points',
        label: 'How many penalty points do you have?',
        type: 'select',
        options: ['None', '3 points', '6 points', 'More than 6 points'],
        required: true,
      },
      {
        key: 'luton_experience',
        label: 'Have you driven Luton vans or similar larger vehicles?',
        type: 'select',
        options: [
          'Yes, regularly',
          'Yes, occasionally',
          'No, but I am confident driving larger vehicles',
          'No',
        ],
        required: true,
      },
      {
        key: 'work_away',
        label: 'I am happy to work away overnight once or twice a month',
        type: 'checkbox',
        required: false,
      },
      {
        key: 'availability',
        label: 'How soon could you start?',
        type: 'select',
        options: ['Immediately', 'Within 2 weeks', 'Within a month', 'Longer than a month'],
        required: true,
      },
    ],
  },
];

/**
 * The CRM payload doesn't yet carry the SEO metadata (datePosted, salary, remote) or the
 * richer type label — graft the fallback's values onto CRM postings with a matching slug
 * so the JobPosting structured data stays rich in CRM mode too. CRM-only slugs pass
 * through untouched; once the CRM starts sending these fields, its values win.
 */
export function withFallbackMeta(postings: CrmPosting[]): CrmPosting[] {
  return postings.map((posting) => {
    const fallback = FALLBACK_POSTINGS.find((f) => f.slug === posting.slug);
    if (!fallback) return posting;
    return {
      ...posting,
      typeLabel: posting.typeLabel ?? fallback.typeLabel,
      datePosted: posting.datePosted ?? fallback.datePosted,
      salary: posting.salary ?? fallback.salary,
      remote: posting.remote ?? fallback.remote,
    };
  });
}

/** Human label for the employment type badge on the role cards. */
export const EMPLOYMENT_LABELS: Record<CrmPosting['employmentType'], string> = {
  full_time: 'Full-Time',
  part_time: 'Part-Time',
  contract: 'Contract',
  temporary: 'Temporary',
};
