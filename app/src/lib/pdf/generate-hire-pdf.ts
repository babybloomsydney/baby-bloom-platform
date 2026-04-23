import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientHireSummaryPDF } from './client-hire-summary';
import { ProfessionalHireSummaryPDF } from './professional-hire-summary';

function generateRefNumber(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
  return `BB-${year}-${seq}`;
}

interface GenerateClientPDFParams {
  clientName: string;
  professionalName: string;
  hireDate: string;
  verificationDate: string;
  hireId: string;
}

interface GenerateProfessionalPDFParams {
  professionalName: string;
  clientName: string;
  hireDate: string;
  verificationDate: string;
  hireId: string;
}

export async function generateClientHirePDF(params: GenerateClientPDFParams): Promise<{
  buffer: Buffer;
  filename: string;
  referenceNumber: string;
} | null> {
  try {
    const referenceNumber = generateRefNumber();
    const element = createElement(ClientHireSummaryPDF, {
      clientName: params.clientName,
      professionalName: params.professionalName,
      referenceNumber,
      hireDate: params.hireDate,
      verificationDate: params.verificationDate,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);
    const filename = `client-hire-summary-${referenceNumber}.pdf`;

    // Upload to Supabase Storage
    const adminClient = createAdminClient();
    const { error } = await adminClient.storage
      .from('hire-pdfs')
      .upload(`${params.hireId}/${filename}`, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.error('Failed to upload client PDF:', error);
    }

    return { buffer: Buffer.from(buffer), filename, referenceNumber };
  } catch (err) {
    console.error('Failed to generate client hire PDF:', err);
    return null;
  }
}

export async function generateProfessionalHirePDF(params: GenerateProfessionalPDFParams): Promise<{
  buffer: Buffer;
  filename: string;
  referenceNumber: string;
} | null> {
  try {
    const referenceNumber = generateRefNumber();
    const element = createElement(ProfessionalHireSummaryPDF, {
      professionalName: params.professionalName,
      clientName: params.clientName,
      referenceNumber,
      hireDate: params.hireDate,
      verificationDate: params.verificationDate,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);
    const filename = `professional-hire-summary-${referenceNumber}.pdf`;

    const adminClient = createAdminClient();
    const { error } = await adminClient.storage
      .from('hire-pdfs')
      .upload(`${params.hireId}/${filename}`, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.error('Failed to upload professional PDF:', error);
    }

    return { buffer: Buffer.from(buffer), filename, referenceNumber };
  } catch (err) {
    console.error('Failed to generate professional hire PDF:', err);
    return null;
  }
}
