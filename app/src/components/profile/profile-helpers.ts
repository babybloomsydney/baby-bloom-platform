import {
  Clock,
  Baby,
  GraduationCap,
  Award,
  Car,
  Globe,
  Heart,
  Stethoscope,
  CigaretteOff,
  PawPrint,
  Users,
  ShieldCheck,
  Briefcase,
  BookOpen,
  Check,
} from "lucide-react";

export function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function ageRangeToFriendly(minMonths: number, maxMonths: number): string {
  const minLabel = minMonths === 0 ? "Newborns" : minMonths < 12 ? `${minMonths}mth olds` : `${Math.floor(minMonths / 12)}yr olds`;
  const maxLabel = maxMonths < 12 ? `${maxMonths}mth olds` : `${Math.floor(maxMonths / 12)}yr olds`;
  return `${minLabel} to ${maxLabel}`;
}

export function childrenCountLabel(count: number): string {
  if (count === 1) return "1 child";
  return `Up to ${count} children`;
}

export const BADGE_ICONS: Record<string, React.ElementType> = {
  Clock, Baby, GraduationCap, Award, Car, Globe, Heart,
  Stethoscope, CigaretteOff, PawPrint, Users, ShieldCheck,
  Briefcase, BookOpen, Check,
};
