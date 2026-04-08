'use client'

import { useState, useCallback } from 'react'

export interface Project {
  id: string
  name: string
  apiKey: string
  createdAt: string
}

export function useProject() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createProject = useCallback(async (name: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        throw new Error('Failed to create project')
      }

      const newProject = await response.json()
      setCurrentProject(newProject)
      setProjects((prev) => [...prev, newProject])
      return newProject
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/projects')
      if (!response.ok) {
        throw new Error('Failed to fetch projects')
      }
      const data = await response.json()
      setProjects(data)
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    currentProject,
    setCurrentProject,
    projects,
    loading,
    error,
    createProject,
    fetchProjects,
  }
}
