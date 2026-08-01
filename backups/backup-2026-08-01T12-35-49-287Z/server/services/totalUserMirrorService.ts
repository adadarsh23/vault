import { TotalUser } from '../models/totalUser.ts'

export const upsertTotalUserMirror = async (input: {
  username: string
  userId: string
  createdDate: Date
}) => {
  try {
    await TotalUser.findOneAndUpdate(
      { username: input.username },
      {
        exists: true,
        exactMatch: true,
        username: input.username,
        userId: input.userId,
        createdDate: input.createdDate,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).exec()
  } catch (error) {
    const candidate = error as { code?: number }
    if (candidate?.code === 11000) {
      await TotalUser.updateOne(
        { username: input.username },
        {
          $set: {
            exists: true,
            exactMatch: true,
            userId: input.userId,
            createdDate: input.createdDate,
          },
        },
      ).exec()
      return
    }
    throw error
  }
}

