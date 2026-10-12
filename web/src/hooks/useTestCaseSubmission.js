import { useCallback, useState } from 'react';
import {
  ApiError,
  FormInvalidError,
  fileApprovedCases,
  importRequirements,
  previewTestCase,
  submitTestCase,
} from '../services/testCaseService';

/**
 * Owns the submission state machine -- busy flag, field errors, feedback
 * status, and the reviewed/edited cases -- so `App` stays declarative and
 * the form stays presentational.
 */
export function useTestCaseSubmission({ onCreated } = {}) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [cases, setCases] = useState(null);
  const [edited, setEdited] = useState(false);

  const handleFailure = useCallback((err) => {
    if (err instanceof FormInvalidError) {
      setErrors(err.fieldErrors);
      setStatus({ kind: 'error', title: 'Check the form', message: err.message });
      return;
    }

    if (err instanceof ApiError) {
      setErrors(err.fieldErrors);
      setStatus({
        kind: 'error',
        message: err.message,
        details: Object.values(err.fieldErrors ?? {}),
        needsAuth: err.needsAuth,
      });
      return;
    }

    setStatus({ kind: 'error', message: 'An unexpected error occurred. Please try again.' });
  }, []);

  const run = useCallback(
    async (fn) => {
      setBusy(true);
      setErrors({});
      setStatus(null);
      try {
        return await fn();
      } catch (err) {
        handleFailure(err);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [handleFailure],
  );

  /** One success message for every way of filing: note, import or agent. */
  const report = useCallback((result) => {
    if (result.kind === 'file') {
      setStatus({
        kind: 'success',
        issueKey: result.issueKey,
        message: `Workbook downloaded with ${result.count} ${result.count === 1 ? 'case' : 'cases'}. Check your browser's downloads.`,
      });
      return;
    }
    const count = result.items?.length ?? 1;
    setStatus({
      kind: 'success',
      issueKey: result.issueKey,
      url: result.url,
      message:
        count === 1
          ? `Filed in ${result.label}.`
          : `${count} cases filed in ${result.label}: ${result.items.map((i) => i.ref).join(', ')}.`,
    });
  }, []);

  const submit = useCallback(
    (form) =>
      run(async () => {
        // Edited cases are sent verbatim; otherwise the server generates.
        const payload = edited && cases ? { ...form, testCases: cases } : form;
        const result = await submitTestCase(payload);
        if (result.kind !== 'file') {
          setCases(result.testCases);
          setEdited(false);
        }
        report(result);
        onCreated?.(result);
        return result;
      }),
    [run, report, onCreated, edited, cases],
  );

  /** Files the cases the agent wrote and the reviewer approved, exactly as approved. */
  const fileCases = useCallback(
    (destination, testCases) =>
      run(async () => {
        const result = await fileApprovedCases({ destination, testCases });
        report(result);
        return result;
      }),
    [run, report],
  );

  const requestPreview = useCallback(
    (form) =>
      run(async () => {
        const testCases = await previewTestCase(form);
        setCases(testCases);
        setEdited(false);
        setStatus({
          kind: 'info',
          title: 'Preview only',
          message: `${testCases.length} ${testCases.length === 1 ? 'case' : 'cases'} generated. Edit anything below — what you see is what gets filed.`,
        });
        return testCases;
      }),
    [run],
  );

  /** Extracts requirements from the document; resolves to them, or null on failure. */
  const extractRequirements = useCallback(
    (form) =>
      run(async () => {
        const result = await importRequirements(form);
        const count = result.requirements.length;
        setStatus({
          kind: 'info',
          title: `${count} ${count === 1 ? 'requirement' : 'requirements'} found`,
          message: result.truncated
            ? `Only the first ${count} were kept. Split the document to import the rest.`
            : 'Untick any you do not want, then preview or create.',
        });
        return result.requirements;
      }),
    [run],
  );

  /** Marks the cases as hand-edited, which switches submit to send them. */
  const editCases = useCallback((next) => {
    setCases(next);
    setEdited(true);
  }, []);

  return {
    busy,
    errors,
    status,
    cases,
    edited,
    submit,
    fileCases,
    requestPreview,
    extractRequirements,
    editCases,
    discardEdits: () => setEdited(false),
    setStatus,
    dismiss: () => setStatus(null),
  };
}
