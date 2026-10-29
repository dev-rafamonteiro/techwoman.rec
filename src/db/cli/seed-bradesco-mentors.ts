import { ObjectId } from 'mongodb';
import { connect } from '../client.js';
import { createIndexes } from '../indexes.js';
import { INITIAL_BRADESCO_MENTORS } from '../bradesco-mentor-seed.js';

const { client, db } = await connect();
try {
  await createIndexes(db, { searchIndexes: false });
  const collection = db.collection('bradesco_mentors');
  const now = new Date();
  let created = 0;
  for (const mentor of INITIAL_BRADESCO_MENTORS) {
    const exists = await collection.findOne({ name: mentor.name }, { projection: { _id: 1 } });
    if (exists) continue;
    await collection.insertOne({ _id: new ObjectId(), ...mentor, scheduleVersion: 0, createdAt: now, updatedAt: now });
    created += 1;
  }
  console.log(`${created} mentoras Bradesco importadas; registros já existentes foram preservados.`);
} finally {
  await client.close();
}
