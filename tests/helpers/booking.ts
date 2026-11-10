let n = 0;

/** Horário e mentora que E02 exige (RN24): um horário diferente a cada chamada, para as inscrições do arquivo não colidirem. */
export const booking = (mentorId: unknown) => ({ slotId: `s${String((n++ % 12) + 1).padStart(2, "0")}`, mentorId: String(mentorId) });
