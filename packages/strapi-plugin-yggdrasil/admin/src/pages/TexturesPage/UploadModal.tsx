import { Box, Button, Flex, Modal, TextInput, Typography } from '@strapi/design-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'styled-components';
import { texturesApi } from '../../api/texturesApi';
import defaultCapeAsset from '../../assets/default-cape.png';
import defaultSkinAsset from '../../assets/default-skin.png';
import SkinViewer3D from '../../components/SkinViewer3D';
import { useTranslate } from '../../hooks/useTranslate';

interface Props {
  onSkinUploaded: () => void;
  onCapeUploaded: () => void;
  onClose: () => void;
}

interface DropZoneProps {
  label: string;
  hint: string;
  file: File | null;
  onFile: (file: File) => void;
}

const DropZone = ({ label, hint, file, onFile }: DropZoneProps) => {
  const translate = useTranslate();
  const theme = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (candidate: File | null) => {
    if (candidate?.type === 'image/png') onFile(candidate);
  };

  const isFilled = !!file;
  const borderColor = dragOver
    ? theme.colors.primary600
    : isFilled
      ? theme.colors.success600
      : theme.colors.neutral400;
  const backgroundColor = dragOver
    ? theme.colors.primary100
    : isFilled
      ? theme.colors.success100
      : theme.colors.neutral100;

  return (
    <Box style={{ flex: 1, minWidth: 0 }}>
      <Flex justifyContent="space-between" alignItems="baseline" style={{ marginBottom: 8 }}>
        <Typography variant="sigma" textColor="neutral600">
          {label}
        </Typography>
        <Typography variant="pi" textColor="neutral500">
          {hint}
        </Typography>
      </Flex>

      <Box
        style={{
          border: `2px dashed ${borderColor}`,
          borderRadius: 8,
          padding: '20px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: backgroundColor,
          transition: 'border-color 0.15s, background 0.15s',
          minHeight: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event: React.DragEvent) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event: React.DragEvent) => {
          event.preventDefault();
          setDragOver(false);
          acceptFile(event.dataTransfer.files[0] ?? null);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          style={{ display: 'none' }}
          onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <Typography variant="omega" fontWeight="semiBold" textColor="success600">
              ✓ {file.name}
            </Typography>
            <Typography variant="pi" textColor="neutral500">
              {(file.size / 1024).toFixed(1)} KB · {translate('upload.dropzone.replace')}
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="omega" textColor="neutral400">
              {translate('upload.dropzone.title')}
            </Typography>
            <Typography variant="pi" textColor="neutral500">
              {translate('upload.dropzone.subtitle')}
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

const UploadModal = ({ onSkinUploaded, onCapeUploaded, onClose }: Props) => {
  const translate = useTranslate();
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [skinFile, setSkinFile] = useState<File | null>(null);
  const [capeFile, setCapeFile] = useState<File | null>(null);
  const [skinPreview, setSkinPreview] = useState<string | null>(null);
  const [capePreview, setCapePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (skinPreview) URL.revokeObjectURL(skinPreview);
    },
    [skinPreview],
  );

  useEffect(
    () => () => {
      if (capePreview) URL.revokeObjectURL(capePreview);
    },
    [capePreview],
  );

  const handleSkinFile = useCallback(
    (file: File) => {
      if (file.type !== 'image/png') {
        setError(translate('error.skin.notPng'));
        return;
      }
      setError(null);
      setSkinFile(file);
      setSkinPreview(URL.createObjectURL(file));
    },
    [translate],
  );

  const handleCapeFile = useCallback(
    (file: File) => {
      if (file.type !== 'image/png') {
        setError(translate('error.cape.notPng'));
        return;
      }
      setError(null);
      setCapeFile(file);
      setCapePreview(URL.createObjectURL(file));
    },
    [translate],
  );

  const handleSubmit = async () => {
    const numericUserId = Number(userId);
    if (!numericUserId) {
      setError(translate('error.playerId.required'));
      return;
    }
    if (!skinFile && !capeFile) {
      setError(translate('error.assets.required'));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await Promise.all([
        skinFile
          ? texturesApi
              .uploadSkin(numericUserId, username || undefined, skinFile)
              .then(() => onSkinUploaded())
          : Promise.resolve(),
        capeFile
          ? texturesApi
              .uploadCape(numericUserId, username || undefined, capeFile)
              .then(() => onCapeUploaded())
          : Promise.resolve(),
      ]);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : translate('error.upload.failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal.Root
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Modal.Content>
        <Modal.Header>
          <Typography variant="beta">{translate('upload.title')}</Typography>
        </Modal.Header>

        <Modal.Body>
          <Flex gap={8} alignItems="flex-start">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Box paddingBottom={4}>
                <Typography
                  variant="sigma"
                  textColor="neutral600"
                  style={{ display: 'block', marginBottom: 6 }}
                >
                  {translate('upload.field.playerId')}
                </Typography>
                <TextInput
                  name="userId"
                  type="number"
                  value={userId}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setUserId(event.target.value)
                  }
                  placeholder={translate('upload.field.playerIdPlaceholder')}
                  aria-label={translate('upload.field.playerId')}
                />
              </Box>

              <Box paddingBottom={6}>
                <Typography
                  variant="sigma"
                  textColor="neutral600"
                  style={{ display: 'block', marginBottom: 6 }}
                >
                  {translate('field.username')}{' '}
                  <Typography variant="pi" textColor="neutral400">
                    {translate('upload.label.optional')}
                  </Typography>
                </Typography>
                <TextInput
                  name="username"
                  value={username}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setUsername(event.target.value)
                  }
                  placeholder={translate('upload.field.usernamePlaceholder')}
                  aria-label={translate('field.username')}
                />
              </Box>

              <Flex gap={4}>
                <DropZone
                  label={translate('type.skin')}
                  hint={translate('upload.skin.hint')}
                  file={skinFile}
                  onFile={handleSkinFile}
                />
                <DropZone
                  label={translate('type.cape')}
                  hint={translate('upload.cape.hint')}
                  file={capeFile}
                  onFile={handleCapeFile}
                />
              </Flex>

              {error && (
                <Box paddingTop={3}>
                  <Typography textColor="danger600" variant="pi">
                    {error}
                  </Typography>
                </Box>
              )}
            </Box>

            <Box
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
            >
              <SkinViewer3D
                skinUrl={skinPreview ?? defaultSkinAsset}
                capeUrl={capePreview ?? defaultCapeAsset}
                width={180}
                height={300}
              />
              <Typography variant="pi" textColor="neutral400">
                {translate('upload.preview')}
              </Typography>
            </Box>
          </Flex>
        </Modal.Body>

        <Modal.Footer>
          <Modal.Close>
            <Button variant="tertiary" onClick={onClose}>
              {translate('button.cancel')}
            </Button>
          </Modal.Close>
          <Button
            onClick={handleSubmit}
            loading={uploading}
            disabled={!userId || (!skinFile && !capeFile)}
          >
            {translate('button.upload')}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export default UploadModal;
