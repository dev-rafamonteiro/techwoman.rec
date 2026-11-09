import { ENDPOINTS } from '@tw/shared';
import { PhotoUpload, call, callForm, photoForm, useAuth, useToast } from '../../../ui';

/** A própria mentora carrega ou remove a foto do perfil público (E55, E28). */
export function MentorPhotoField() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  return (
    <PhotoUpload
      url={user?.photoUrl ?? null}
      testId="mentor-photo"
      onFile={async (blob) => {
        await callForm(ENDPOINTS.E55, { form: photoForm(blob) });
        await refresh();
        toast.success('Foto salva.');
      }}
      onRemove={async () => {
        await call(ENDPOINTS.E28, { body: { photoUrl: null } });
        await refresh();
        toast.success('Foto removida.');
      }}
    />
  );
}
