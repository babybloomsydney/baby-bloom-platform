# Baby Bloom Sydney — Public Site Plan

## Brand Positioning

**Core identity:** Education-first childcare platform.
Baby Bloom exists to connect families with childcare professionals who actively develop children — not just supervise them. The free matchmaking is the delivery mechanism for that mission.

**Brand voice:** Authoritative guru. Warm, confident, knowledgeable. Speaks from experience, not from a script. Never salesy. Uses "we" and "your family" — personal, direct.

**The dual-CTA psychology:** Every page shows both parent and nanny entry points. The nanny CTA ("Experienced childcare professional? Apply now to start supporting young minds") isn't just recruitment — it signals quality to parents reading the same page.

---

## Site Map

```
/ (Homepage)                    ← The emotional entry point
/about                          ← Who we are, our philosophy, the team
/how-it-works                   ← Practical walkthrough for parents + nannies
/nannies                        ← Browse nanny profiles (ALREADY BUILT)
/nanny/[id]                     ← Individual nanny profile (FUTURE)
/babysitting                    ← One-off babysitting service explanation
/contact                        ← Get in touch
/apply/nanny                    ← Nanny application landing page (links to signup)
/signup                         ← Auth flow (ALREADY BUILT)
/login                          ← Auth flow (ALREADY BUILT)
```

**Pages removed from current nav:**
- `/pricing` → Remove. Everything is free. Mentioning pricing implies there might be hidden costs. The "free" message is woven into the homepage and about page naturally.

**Nav structure (guest/public):**
- Home
- Browse Nannies
- How It Works
- About
- Babysitting
- Apply as a Nanny (highlighted/styled differently as a CTA)

---

## Page-by-Page Plan

---

### 1. HOMEPAGE `/`

**Purpose:** First impression. Parent lands here and within 10 seconds understands: (1) what Baby Bloom is, (2) why it's different, (3) what to do next.

**Hero Section**

Headline direction: Lead with the child's development, not the service mechanics.

- Primary headline: Something like "Give your child the start they deserve" or "Where Sydney families find childcare that actually educates"
- Sub-headline: Explain the "what" — we match families with verified childcare professionals who prioritise your child's development. Completely free.
- Primary CTA: "Find Your Nanny" → /nannies
- Secondary CTA: "Experienced childcare professional? Apply now to start supporting young minds" → /apply/nanny
- Trust strip below CTAs: WWCC Verified · Police Checked · First Aid Trained · 100% Free

**Why Baby Bloom Section**

Three cards or blocks explaining what makes this different from other platforms:
1. **Education-focused nannies** — Our professionals don't just care for your child, they actively support their learning and development through play, routines, and age-appropriate activities.
2. **Verified and vetted** — Every nanny passes our multi-step verification: Working With Children Check, passport ID, police check, and real references. No exceptions.
3. **Completely free** — No finder's fees, no commissions, no hidden costs. We believe every family deserves access to quality childcare, not just those who can afford agency fees.

**How It Works (Brief)**

4 steps — keep it tight, link to the full how-it-works page for detail:
1. Browse verified profiles
2. Find your match (filter by experience, availability, location)
3. Request an interview
4. Hire with confidence

**Nanny Showcase**

Pull 3-4 real nanny cards from the database (or use polished placeholders). Show:
- Profile photo
- Name, suburb
- Experience summary
- Verification badges
- "View Profile" link

This section does the heavy lifting. Parents seeing real people with real qualifications is more convincing than any copy.

**For Nannies Section**

Brief section with clear value props for nannies:
- Free to join, no commission on your earnings
- AI-generated professional profile
- Set your own rates and availability
- Get matched with families who value quality childcare
- CTA: "Apply as a Childcare Professional" → /apply/nanny

**Social Proof / Trust Section**

Stats (real or aspirational for launch):
- Number of verified nannies
- Number of families matched
- Average match time
- Sydney suburbs covered

If you have any testimonials (even informal ones from your Wix era), add them here.

**Final CTA**

Clean bottom section:
- "Your child's next great chapter starts here"
- Two buttons: Browse Nannies / Create Account

---

### 2. ABOUT `/about`

**Purpose:** For parents who want to understand the people and philosophy behind the platform. This is where "why it's free" gets its full answer.

**Hero**

- Headline: "We believe every child deserves childcare that educates"
- Sub: Brief origin story — started because finding quality, verified childcare in Sydney was broken. Too many faceless listings, too many unverified strangers, too many agencies charging $1,000+ for a basic introduction.

**Our Philosophy Section**

This is the heart of the page. Key messages:
- Children learn the most in their earliest years. The people who spend time with them during these years have an enormous impact.
- A nanny isn't just childcare — it's a developmental opportunity. The right nanny turns everyday moments into learning moments.
- We built Baby Bloom to make this level of care accessible to every Sydney family, not just those who can afford premium agencies.
- That's why it's free. Our mission is education. Matchmaking is how we get there.

**What Makes Our Nannies Different**

Explain the vetting and the calibre:
- Multi-step verification (WWCC, ID, police check, references)
- We actively seek nannies with early childhood education backgrounds
- AI-assisted professional profiles so parents see the real person
- Nannies choose to be here — they're professionals who care about development, not just a pay cheque

**The Team**

Bailey's story. Keep it personal and real. This isn't a faceless startup — it's someone who genuinely cares about this problem.

**CTA**

Same dual-CTA pattern: Browse Nannies / Apply as a Nanny

---

### 3. HOW IT WORKS `/how-it-works`

**Purpose:** Practical guide for parents (and secondarily nannies) who want to understand the process before committing.

**Two tracks on one page:**

#### For Parents:
1. **Browse** — Explore verified nanny profiles filtered by location, experience, availability, and more
2. **Match** — Our smart matching considers your family's specific needs — schedule, children's ages, location, and what matters most to you
3. **Interview** — Request an interview with your top choices. Pick three times that work for you, and we coordinate everything
4. **Hire** — Found the one? Hire directly — no agency fees, no middlemen, no surprises

#### For Nannies:
1. **Apply** — Create your profile in minutes. Our AI helps you write a professional bio that showcases your experience
2. **Get Verified** — Upload your WWCC and ID. Our system verifies your credentials so families can trust you instantly
3. **Get Matched** — Families in your area find you based on your skills, availability, and experience
4. **Start Working** — Accept interview requests, set your own rates, build lasting relationships with families

**Verification Section**

Visual breakdown of the 3-tier verification system:
- Tier 1: Profile created and visible
- Tier 2: WWCC + ID verified — visible in matchmaking
- Tier 3: Fully verified — eligible for babysitting requests

This builds trust. Parents see that the platform takes safety seriously.

**FAQ (brief)**

- Is it really free? Yes, 100%. No hidden fees for parents or nannies.
- How are nannies verified? Multi-step: WWCC, passport ID, police check, references.
- How long does matching take? Most families find candidates within 48 hours.
- Can I book a one-off babysitter? Yes — post a babysitting request and we'll notify the closest verified nannies.

**CTA**

"Ready to get started?" → Browse Nannies / Apply as a Nanny

---

### 4. BABYSITTING `/babysitting`

**Purpose:** Explain the one-off babysitting service for parents who need occasional care, not a permanent nanny.

**Hero**

- Headline: "Last-minute babysitter? We've got you covered."
- Sub: Need a trusted sitter for date night, an appointment, or an emergency? Post your request and we'll notify the closest verified nannies in your area.

**How Babysitting Works**

1. Post your request — date, time, location, any special needs
2. We notify the 20 closest verified nannies available at that time
3. First to accept gets the job — you'll see their full profile and verification status
4. Rate and review after the booking

**Trust Callout**

- Every babysitter is a fully verified Baby Bloom nanny (Tier 3)
- Same verification standards as permanent placements
- You see their full profile before confirming

**CTA**

"Need a babysitter?" → Sign up to post a request

---

### 5. NANNY APPLICATION `/apply/nanny`

**Purpose:** This page serves dual duty. For nannies: it's the pitch to join. For parents who land here accidentally: it reinforces the quality message.

**Hero**

- Headline: "Support young minds. Build your career."
- Sub: Join Sydney's network of professional childcare educators. Set your own rates, get matched with families who value quality care, and grow your career — all completely free.

**What You Get**

- AI-powered professional profile that showcases your experience
- Verification badges that build trust with families
- Smart matching with families in your area
- Flexible: permanent positions, part-time, or casual babysitting
- Set your own rates — we never take a cut
- Professional development through our network

**Who We're Looking For**

Be specific about the calibre:
- Experienced childcare professionals (nannies, au pairs, early childhood educators)
- WWCC holders (or willing to obtain)
- First aid trained (or willing to obtain)
- Genuine passion for child development
- Reliable, professional, warm

**Application Process**

1. Create your account (5 minutes)
2. Complete your profile (~15 minutes, 40 fields — we guide you through it)
3. Upload verification documents
4. AI generates your professional bio
5. Go live and start receiving match requests

**CTA**

"Ready to apply?" → /signup?role=nanny

---

### 6. CONTACT `/contact`

**Purpose:** Simple. Let people reach you.

**Content:**
- Contact form (name, email, message, role dropdown: parent/nanny/other)
- Email: admin@babybloomsydney.com.au
- Social links if applicable
- Brief note: "We typically respond within 24 hours"

---

## Cross-Page Elements

**Dual CTA pattern:** Every page ends with both parent and nanny CTAs. The nanny CTA always uses language that signals quality to parents ("childcare professional," "supporting young minds," "early childhood educator").

**Trust strip:** Appears on multiple pages. WWCC Verified · Police Checked · First Aid · 100% Free.

**Consistent voice:** Warm, confident, education-focused. Never desperate or salesy. The guru speaks from a position of "we know what's best for your child's development and we're making it accessible."

---

## Copy Principles

1. **Child first, service second.** Always frame around the child's benefit, not the platform's features.
2. **Show, don't tell.** Real nanny profiles > promises about quality. Verification badges > claims about safety.
3. **Free is the proof, not the pitch.** "We're free because our mission is education" is stronger than "We're free! Sign up now!"
4. **Dual-audience awareness.** Parents are always reading. Even nanny-facing copy should make parents feel good about the platform's standards.
5. **Sydney-specific.** This isn't generic. Reference suburbs, local context. Parents want to know this is their city, their community.

---

## Technical Notes

- All pages live in `app/src/app/(public)/`
- Use existing layout (Sidebar + PublicHeader + Footer)
- Brand kit colours: Violet 500 (#8B5CF6) primary, slate neutrals, green for verified states
- shadcn/ui components throughout
- React Server Components by default
- Nanny showcase section should eventually pull real data from Supabase
- Images: Mix of real content and quality placeholders for launch

---

## Implementation Priority

1. Homepage (biggest impact)
2. About (answers "why should I trust this?")
3. How It Works (answers "how does this actually work?")
4. Nanny Application page (supply side recruitment)
5. Babysitting (secondary service)
6. Contact (simple, low effort)

---

## What's Not Included (Intentionally)

- Pricing page → removed, everything is free
- Blog → not needed for launch, can add later
- Testimonials page → weave into homepage and about instead
- Educational app / paid services → not mentioned anywhere until they're ready
