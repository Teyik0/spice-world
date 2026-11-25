"use client";

import type React from "react";
import {
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  useCallback,
  useRef,
  useState,
} from "react";

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface FileWithPreview {
  file: File | FileMetadata;
  id: string;
  isThumbnail?: boolean;
  preview?: string;
}

export interface FileUploadOptions {
  accept?: string;
  initialFiles?: FileMetadata[];
  maxFiles?: number; // Only used when multiple is true, defaults to Infinity
  maxSize?: number; // in bytes
  multiple?: boolean; // Defaults to false
  onFilesAdded?: (addedFiles: FileWithPreview[]) => void; // Callback when new files are added
  onFilesChange?: (files: FileWithPreview[]) => void; // Callback when files change
}

export interface FileUploadState {
  errors: string[];
  files: FileWithPreview[];
  isDragging: boolean;
}

export interface FileUploadActions {
  addFiles: (files: FileList | File[]) => void;
  clearErrors: () => void;
  clearFiles: () => void;
  getInputProps: (
    props?: InputHTMLAttributes<HTMLInputElement>,
  ) => InputHTMLAttributes<HTMLInputElement> & {
    ref: React.RefObject<HTMLInputElement | null>;
  };
  handleDragEnter: (e: DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
  handleDragOver: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>) => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  openFileDialog: () => void;
  removeFile: (id: string) => void;
  setThumbnail: (id: string) => void;
}

export const useFileUpload = (
  options: FileUploadOptions = {},
): [FileUploadState, FileUploadActions] => {
  const {
    maxFiles = Number.POSITIVE_INFINITY,
    maxSize = Number.POSITIVE_INFINITY,
    accept = "*",
    multiple = false,
    initialFiles = [],
    onFilesChange,
    onFilesAdded,
  } = options;

  const [state, setState] = useState<FileUploadState>({
    files: initialFiles.map((file) => ({
      file,
      id: file.id,
      preview: file.url,
    })),
    isDragging: false,
    errors: [],
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File | FileMetadata): string | null => {
      if (file.size > maxSize) {
        return `File "${file.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`;
      }

      if (accept !== "*") {
        const acceptedTypes = accept.split(",").map((type) => type.trim());
        const fileType = file.type;
        const fileExtension = `.${file.name.split(".").pop()}`;

        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith(".")) {
            return fileExtension.toLowerCase() === type.toLowerCase();
          }
          if (type.endsWith("/*")) {
            const [baseType] = type.split("/");
            return fileType.startsWith(`${baseType}/`);
          }
          return fileType === type;
        });

        if (!isAccepted) {
          return `File "${file.name}" is not an accepted file type.`;
        }
      }

      return null;
    },
    [accept, maxSize],
  );

  const createPreview = useCallback(
    (file: File | FileMetadata): string | undefined => {
      if (file instanceof File) {
        return URL.createObjectURL(file);
      }
      return file.url;
    },
    [],
  );

  const generateUniqueId = useCallback((file: File | FileMetadata): string => {
    if (file instanceof File) {
      return `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    return file.id;
  }, []);

  const clearFiles = useCallback(() => {
    setState((prev) => {
      // Clean up object URLs
      for (const file of prev.files) {
        if (
          file.preview &&
          file.file instanceof File &&
          file.file.type.startsWith("image/")
        ) {
          URL.revokeObjectURL(file.preview);
        }
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      const newState = {
        ...prev,
        files: [],
        errors: [],
      };

      onFilesChange?.(newState.files);
      return newState;
    });
  }, [onFilesChange]);

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      if (!newFiles || newFiles.length === 0) {
        return;
      }

      const newFilesArray = Array.from(newFiles);

      // Reset input value IMMEDIATELY to allow re-selecting same file
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      // Use functional setState to avoid stale closure issues
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validate the whole file selection in a single state update to avoid stale state.
      setState((prev) => {
        const errors: string[] = [];

        // Get current files - in single mode start fresh, in multiple mode keep existing
        const currentFiles = multiple ? prev.files : [];

        // Check if adding these files would exceed maxFiles (only in multiple mode)
        if (
          multiple &&
          maxFiles !== Number.POSITIVE_INFINITY &&
          currentFiles.length + newFilesArray.length > maxFiles
        ) {
          errors.push(`You can only upload a maximum of ${maxFiles} files.`);
          return { ...prev, errors };
        }

        const validFiles: FileWithPreview[] = [];

        for (const file of newFilesArray) {
          // Only check for duplicates if multiple files are allowed
          if (multiple) {
            const isDuplicate = currentFiles.some(
              (existingFile) =>
                existingFile.file.name === file.name &&
                existingFile.file.size === file.size,
            );

            // Show error for duplicate files instead of silently skipping
            if (isDuplicate) {
              errors.push(`File "${file.name}" is already added.`);
              continue;
            }
          }

          const error = validateFile(file);
          if (error) {
            errors.push(error);
          } else {
            validFiles.push({
              file,
              id: generateUniqueId(file),
              preview: createPreview(file),
            });
          }
        }

        // Build new files array from current state
        const newFilesState = [...currentFiles, ...validFiles];

        // Call callbacks after state update completes
        if (validFiles.length > 0) {
          // Call onFilesAdded with newly added files
          onFilesAdded?.(validFiles);
          // Call onFilesChange with complete file list
          onFilesChange?.(newFilesState);
        }

        // Return new state
        return {
          ...prev,
          files: newFilesState,
          errors,
        };
      });
    },
    [
      // Removed state.files from dependencies since we now use prev.files
      maxFiles,
      multiple,
      validateFile,
      createPreview,
      generateUniqueId,
      onFilesChange,
      onFilesAdded,
    ],
  );

  const removeFile = useCallback(
    (id: string) => {
      setState((prev) => {
        // Find and revoke object URL if needed
        const fileToRemove = prev.files.find((file) => file.id === id);
        if (
          fileToRemove?.preview &&
          fileToRemove.file instanceof File &&
          fileToRemove.file.type.startsWith("image/")
        ) {
          URL.revokeObjectURL(fileToRemove.preview);
        }

        // Filter out the file
        const newFiles = prev.files.filter((file) => file.id !== id);

        // Call onFilesChange with updated files
        onFilesChange?.(newFiles);

        return {
          ...prev,
          files: newFiles,
          errors: [],
        };
      });
    },
    [onFilesChange],
  );

  const clearErrors = useCallback(() => {
    setState((prev) => ({
      ...prev,
      errors: [],
    }));
  }, []);

  const setThumbnail = useCallback(
    (id: string) => {
      setState((prev) => {
        // Set the selected file as thumbnail and remove thumbnail flag from others
        const newFiles = prev.files.map((file) => ({
          ...file,
          isThumbnail: file.id === id,
        }));

        // Call onFilesChange with updated files
        onFilesChange?.(newFiles);

        return {
          ...prev,
          files: newFiles,
        };
      });
    },
    [onFilesChange],
  );

  const handleDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => ({ ...prev, isDragging: true }));
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }

    setState((prev) => ({ ...prev, isDragging: false }));
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setState((prev) => ({ ...prev, isDragging: false }));

      // Don't process files if the input is disabled
      if (inputRef.current?.disabled) {
        return;
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // In single file mode, only use the first file
        if (multiple) {
          addFiles(e.dataTransfer.files);
        } else {
          const [file] = e.dataTransfer.files;
          if (file) {
            addFiles([file]);
          }
        }
      }
    },
    [addFiles, multiple],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
    },
    [addFiles],
  );

  const openFileDialog = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  }, []);

  const getInputProps = useCallback(
    (props: InputHTMLAttributes<HTMLInputElement> = {}) => ({
      ...props,
      type: "file" as const,
      onChange: handleFileChange,
      accept: props.accept || accept,
      multiple: props.multiple === undefined ? multiple : props.multiple,
      ref: inputRef,
    }),
    [accept, multiple, handleFileChange],
  );

  return [
    state,
    {
      addFiles,
      removeFile,
      clearFiles,
      clearErrors,
      setThumbnail,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      handleFileChange,
      openFileDialog,
      getInputProps,
    },
  ];
};

// Helper function to format bytes to human-readable format
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const k = 1024;
  const dm = Math.max(decimals, 0);
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))}${sizes[i] ?? ""}`;
};
