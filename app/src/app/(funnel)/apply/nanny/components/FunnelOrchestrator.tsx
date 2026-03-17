'use client';

import { useReducer, useEffect, useCallback, useRef } from 'react';
import {
  NannyLeadFunnelState,
  FunnelAction,
  FunnelStage,
  DEFAULT_FUNNEL_STATE,
} from '@/types/nanny-leads';

// Stage components
import { N1Identity } from './stages/n1/N1Identity';
import { N1Experience } from './stages/n1/N1Experience';
import { N1Credentials } from './stages/n1/N1Credentials';
import { N1Location } from './stages/n1/N1Location';
import { N1Contact } from './stages/n1/N1Contact';
import { N2VerificationChecklist } from './stages/n2/N2VerificationChecklist';
import { N2Congratulations } from './stages/n2/N2Congratulations';
import { N3DreamRole } from './stages/n3/N3DreamRole';
import { N3AboutYou } from './stages/n3/N3AboutYou';
import { N3Availability } from './stages/n3/N3Availability';
import { N3Rate } from './stages/n3/N3Rate';
import { N3Photos } from './stages/n3/N3Photos';
import { N4FamilySearch } from './stages/n4/N4FamilySearch';
import { N4ProfileReview } from './stages/n4/N4ProfileReview';
import { N5CreateAccount } from './stages/n5/N5CreateAccount';
import { N5Welcome } from './stages/n5/N5Welcome';

const STORAGE_KEY = 'bb_nanny_lead_funnel';

// ── Page definitions per stage ──

interface PageDef {
  stage: FunnelStage;
  id: string;
}

const PAGES: PageDef[] = [
  // N1: Application (pages 0-8)
  { stage: 'N1', id: 'n1-motivation' },      // 0
  { stage: 'N1', id: 'n1-personality' },      // 1
  { stage: 'N1', id: 'n1-values' },           // 2
  { stage: 'N1', id: 'n1-support' },          // 3
  { stage: 'N1', id: 'n1-experience' },       // 4
  { stage: 'N1', id: 'n1-roles' },            // 5
  { stage: 'N1', id: 'n1-credentials' },      // 6
  { stage: 'N1', id: 'n1-location' },         // 7
  { stage: 'N1', id: 'n1-contact' },          // 8
  // N2: Approval (pages 9-10)
  { stage: 'N2', id: 'n2-verification' },     // 9
  { stage: 'N2', id: 'n2-congratulations' },  // 10
  // N3: Portfolio (pages 11-17)
  { stage: 'N3', id: 'n3-services' },         // 11
  { stage: 'N3', id: 'n3-children' },         // 12
  { stage: 'N3', id: 'n3-additional-needs' }, // 13
  { stage: 'N3', id: 'n3-pets' },             // 14
  { stage: 'N3', id: 'n3-about-you' },        // 15
  { stage: 'N3', id: 'n3-availability' },     // 16
  { stage: 'N3', id: 'n3-rate' },             // 17
  // N4: AI Reveal (pages 18-20)
  { stage: 'N4', id: 'n4-search' },           // 18
  { stage: 'N4', id: 'n4-photos' },           // 19
  { stage: 'N4', id: 'n4-review' },           // 20
  // N5: Account (pages 21-22)
  { stage: 'N5', id: 'n5-create-account' },   // 21
  { stage: 'N5', id: 'n5-welcome' },          // 22
];

// ── Reducer ──

function funnelReducer(state: NannyLeadFunnelState, action: FunnelAction): NannyLeadFunnelState {
  switch (action.type) {
    case 'UPDATE_IDENTITY':
      return { ...state, identity: { ...state.identity, ...action.payload } };
    case 'UPDATE_EXPERIENCE':
      return { ...state, experience: { ...state.experience, ...action.payload } };
    case 'UPDATE_QUALIFICATIONS':
      return { ...state, qualifications: { ...state.qualifications, ...action.payload } };
    case 'UPDATE_RESIDENCY':
      return { ...state, residency: { ...state.residency, ...action.payload } };
    case 'UPDATE_CONTACT':
      return { ...state, ...action.payload };
    case 'UPDATE_PREFERENCES':
      return { ...state, preferences: { ...state.preferences, ...action.payload } };
    case 'UPDATE_AVAILABILITY':
      return { ...state, availability: { ...state.availability, ...action.payload } };
    case 'UPDATE_SALARY':
      return { ...state, salary: { ...state.salary, ...action.payload } };
    case 'UPDATE_MATCHING':
      return { ...state, matching: { ...state.matching, ...action.payload } };
    case 'UPDATE_ABOUT_YOU':
      return { ...state, about_you: { ...state.about_you, ...action.payload } };
    case 'SET_AI_BIO':
      return { ...state, ai_bio: action.payload };
    case 'SET_AI_CONTENT':
      return { ...state, ai_content: action.payload };
    case 'SET_LEAD_ID':
      return { ...state, leadId: action.payload };
    case 'SET_STAGE':
      return { ...state, currentStage: action.payload };
    case 'SET_PAGE':
      return { ...state, currentPage: action.payload };
    case 'RESTORE_STATE':
      return action.payload;
    default:
      return state;
  }
}

// ── Question number mapping ──

const QUESTION_NUMBERS: Record<string, string> = {
  'n1-motivation': 'Q1',
  'n1-personality': 'Q2',
  'n1-values': 'Q3',
  'n1-support': 'Q4',
  'n1-experience': 'Q5',
  'n1-roles': 'Q6',
  'n1-credentials': 'Q7',
  'n1-location': 'Q8',
  'n1-contact': 'Q9',
  'n3-services': 'Q10',
  'n3-children': 'Q11',
  'n3-additional-needs': 'Q12',
  'n3-pets': 'Q13',
  'n3-about-you': 'Q14',
  'n3-availability': 'Q15',
  'n3-rate': 'Q16',
  'n4-photos': 'Q17',
  'n4-review': 'Q18',
  'n5-create-account': 'Q19',
};

// ── Shared stage props interface ──

export interface StageProps {
  state: NannyLeadFunnelState;
  dispatch: React.Dispatch<FunnelAction>;
  goNext: () => void;
  goBack: () => void;
  goToPage: (page: number) => void;
  progress: number;
  questionNumber: string;
}

// ── Orchestrator ──

export function FunnelOrchestrator() {
  const [state, dispatch] = useReducer(funnelReducer, DEFAULT_FUNNEL_STATE);
  const initialized = useRef(false);

  // Restore state from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as NannyLeadFunnelState;
        dispatch({ type: 'RESTORE_STATE', payload: parsed });
      }
    } catch {
      // Corrupted storage — start fresh
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Persist state to localStorage on every change
  useEffect(() => {
    if (!initialized.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable — silently continue
    }
  }, [state]);

  const goNext = useCallback(() => {
    const nextPage = state.currentPage + 1;
    if (nextPage < PAGES.length) {
      const nextStageDef = PAGES[nextPage];
      dispatch({ type: 'SET_PAGE', payload: nextPage });
      if (nextStageDef.stage !== state.currentStage) {
        dispatch({ type: 'SET_STAGE', payload: nextStageDef.stage });
      }
    }
  }, [state.currentPage, state.currentStage]);

  const goBack = useCallback(() => {
    const prevPage = state.currentPage - 1;
    if (prevPage >= 0) {
      const prevStageDef = PAGES[prevPage];
      dispatch({ type: 'SET_PAGE', payload: prevPage });
      if (prevStageDef.stage !== state.currentStage) {
        dispatch({ type: 'SET_STAGE', payload: prevStageDef.stage });
      }
    }
  }, [state.currentPage, state.currentStage]);

  const goToPage = useCallback((page: number) => {
    if (page >= 0 && page < PAGES.length) {
      const pageDef = PAGES[page];
      dispatch({ type: 'SET_PAGE', payload: page });
      dispatch({ type: 'SET_STAGE', payload: pageDef.stage });
    }
  }, []);

  const progress = Math.round(((state.currentPage + 1) / PAGES.length) * 100);
  const currentPageDef = PAGES[state.currentPage];
  const questionNumber = currentPageDef ? (QUESTION_NUMBERS[currentPageDef.id] || '') : '';
  const stageProps: StageProps = { state, dispatch, goNext, goBack, goToPage, progress, questionNumber };

  // Render the current page
  const renderPage = () => {
    if (!currentPageDef) return null;

    switch (currentPageDef.id) {
      // N1: Identity (pages 0-3)
      case 'n1-motivation':
      case 'n1-personality':
      case 'n1-support':
      case 'n1-values':
        return <N1Identity {...stageProps} subPage={currentPageDef.id} />;
      // N1: Experience (pages 4-5)
      case 'n1-experience':
      case 'n1-roles':
        return <N1Experience {...stageProps} subPage={currentPageDef.id} />;
      // N1: Credentials (page 6)
      case 'n1-credentials':
        return <N1Credentials {...stageProps} />;
      // N1: Location (page 7)
      case 'n1-location':
        return <N1Location {...stageProps} />;
      // N1: Contact (page 8)
      case 'n1-contact':
        return <N1Contact {...stageProps} />;
      // N2: Verification (page 9)
      case 'n2-verification':
        return <N2VerificationChecklist {...stageProps} />;
      // N2: Congratulations (page 10)
      case 'n2-congratulations':
        return <N2Congratulations {...stageProps} />;
      // N3: Dream Role (pages 11-14)
      case 'n3-services':
      case 'n3-children':
      case 'n3-additional-needs':
      case 'n3-pets':
        return <N3DreamRole {...stageProps} subPage={currentPageDef.id} />;
      // N3: About You (page 15)
      case 'n3-about-you':
        return <N3AboutYou {...stageProps} />;
      // N3: Availability (page 16)
      case 'n3-availability':
        return <N3Availability {...stageProps} />;
      // N3: Rate (page 17)
      case 'n3-rate':
        return <N3Rate {...stageProps} />;
      // N4: Family Search (page 18)
      case 'n4-search':
        return <N4FamilySearch {...stageProps} />;
      // N4: Photos (page 19) — after search, before profile
      case 'n4-photos':
        return <N3Photos {...stageProps} />;
      // N4: Profile Review (page 20)
      case 'n4-review':
        return <N4ProfileReview {...stageProps} />;
      // N5: Create Account (page 21)
      case 'n5-create-account':
        return <N5CreateAccount {...stageProps} />;
      // N5: Welcome (page 22)
      case 'n5-welcome':
        return <N5Welcome {...stageProps} />;
      default:
        return null;
    }
  };

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <>
      {renderPage()}
      {isDev && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          right: 16,
          display: 'flex',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 9999,
        }}>
          <button
            onClick={goBack}
            disabled={state.currentPage === 0}
            style={{
              pointerEvents: 'auto',
              padding: '6px 14px',
              fontSize: 12,
              fontFamily: 'monospace',
              background: state.currentPage === 0 ? '#555' : '#1e1e1e',
              color: '#0f0',
              border: '1px solid #0f0',
              borderRadius: 4,
              cursor: state.currentPage === 0 ? 'not-allowed' : 'pointer',
              opacity: 0.8,
            }}
          >
            ← {state.currentPage}
          </button>
          <span style={{
            pointerEvents: 'none',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#0f0',
            background: '#1e1e1e',
            border: '1px solid #0f0',
            borderRadius: 4,
            padding: '6px 10px',
            opacity: 0.8,
            alignSelf: 'center',
          }}>
            {currentPageDef?.stage} · {currentPageDef?.id} · {state.currentPage + 1}/{PAGES.length}
          </span>
          <button
            onClick={goNext}
            disabled={state.currentPage === PAGES.length - 1}
            style={{
              pointerEvents: 'auto',
              padding: '6px 14px',
              fontSize: 12,
              fontFamily: 'monospace',
              background: state.currentPage === PAGES.length - 1 ? '#555' : '#1e1e1e',
              color: '#0f0',
              border: '1px solid #0f0',
              borderRadius: 4,
              cursor: state.currentPage === PAGES.length - 1 ? 'not-allowed' : 'pointer',
              opacity: 0.8,
            }}
          >
            {state.currentPage + 2} →
          </button>
        </div>
      )}
    </>
  );
}
