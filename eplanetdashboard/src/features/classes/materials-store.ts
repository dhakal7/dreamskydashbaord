import { create } from 'zustand'
import type { ClassMaterial } from '@/types'
import { classMaterials as mockMaterials } from '@/mock'



let nextId = mockMaterials.length + 1

export interface AddMaterialData {
  title: string
  type: ClassMaterial['type']
  dueDate?: string
  file?: File
}

interface ClassMaterialsState {
  materials: ClassMaterial[]

  getMaterialsForClass: (classId: string) => ClassMaterial[]
  addMaterial: (classId: string, data: AddMaterialData) => Promise<void>
  removeMaterial: (materialId: string) => void
}

export const useClassMaterialsStore = create<ClassMaterialsState>((set, get) => ({
  materials: [...mockMaterials],

  getMaterialsForClass: (classId) =>
    get().materials.filter((m) => m.classId === classId),

  addMaterial: async (classId, data) => {
    const id = `mat-${classId}-${String(nextId).padStart(3, '0')}`
    nextId++

    let fileUrl: string | undefined
    let fileName: string | undefined
    let fileSize: number | undefined
    let fileType: string | undefined

    if (data.file) {
      // In a real app, this would upload to a server/cloud storage
      // For now, create a data URL for demonstration
      fileUrl = URL.createObjectURL(data.file)
      fileName = data.file.name
      fileSize = Math.round(data.file.size / 1024) // Convert to KB
      fileType = data.file.type || 'application/octet-stream'
    }

    const newMaterial: ClassMaterial = {
      id,
      classId,
      title: data.title,
      type: data.type,
      uploadedAt: new Date().toISOString(),
      dueDate: data.dueDate,
      fileName,
      fileSize,
      fileType,
      fileUrl,
    }

    set((state) => ({ materials: [...state.materials, newMaterial] }))
  },

  removeMaterial: (materialId) => {
    set((state) => ({
      materials: state.materials.filter((m) => m.id !== materialId),
    }))
  },
}))

