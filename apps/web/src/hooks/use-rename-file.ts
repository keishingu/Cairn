import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'
import { useT } from '@/components/locale-provider'
import { chatQueryKeys } from '@/lib/chat/client'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'

interface RenameFileInput {
  fileId: string
  fileName: string
}

interface RenameFileResponse {
  success: true
  fileName: string
}

interface FileNameDto {
  id: string
  fileName: string
}

export function useRenameFile() {
  const queryClient = useQueryClient()
  const t = useT()

  return useMutation<RenameFileResponse, Error, RenameFileInput>({
    mutationFn: async ({ fileId, fileName }) => {
      const response = await fetchWithAuth(`/api/attachments/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? t('Could not rename the file'))
      }
      return response.json() as Promise<RenameFileResponse>
    },
    onSuccess: ({ fileName }, { fileId }) => {
      const updateFileList = (current: FileNameDto[] | undefined) =>
        current?.map(file => file.id === fileId ? { ...file, fileName } : file)

      queryClient.setQueriesData<FileNameDto[]>({ queryKey: ['files'] }, updateFileList)
      queryClient.setQueriesData<FileNameDto[]>({ queryKey: ['project-files'] }, updateFileList)
      queryClient.setQueriesData<FileNameDto[]>({ queryKey: ['channel-files'] }, updateFileList)
      queryClient.setQueriesData<MessageDto[]>({ queryKey: chatQueryKeys.messagesRoot }, current =>
        current?.map(message => ({
          ...message,
          attachments: message.attachments.map(attachment =>
            attachment.fileId === fileId ? { ...attachment, fileName } : attachment),
        })),
      )

      toast.success(t('Renamed the file'))
    },
    onError: error => toast.error(error.message),
  })
}
